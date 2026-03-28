"""
model.py — COCIS Assistant: RAG + Multilingual Translation
All heavy model loading and inference is encapsulated in COCISAssistant.
"""

import logging
import numpy as np
import faiss
import torch
from datasets import load_dataset
from sentence_transformers import SentenceTransformer
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    AutoModelForSeq2SeqLM,
)

logger = logging.getLogger("cocis-model")


# ─── Language Code Map ────────────────────────────────────────────────────────
LANG_CODES: dict[str, str] = {
    "english": "eng_Latn",
    "luganda": "lug_Latn",
    "acholi": "ach_Latn",
}


class COCISAssistant:
    """
    End-to-end COCIS multilingual RAG assistant.

    Pipeline:
        1. Embed knowledge base chunks with SentenceTransformer → FAISS index
        2. At query time, translate input → English (NLLB)
        3. Retrieve top-k chunks from FAISS
        4. Generate answer with Phi-4-mini-instruct
        5. Translate answer → target language (NLLB)
    """

    # ── Model names (easy to swap) ───────────────────────────────────────────
    EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
    LLM_MODEL_NAME = "microsoft/Phi-4-mini-instruct"
    TRANSLATE_MODEL_NAME = "facebook/nllb-200-distilled-600M"
    DATASET_NAME = "jimjunior/cocis-web-info"

    def __init__(self) -> None:
        self._load_dataset()
        self._load_embed_model()
        self._build_faiss_index()
        self._load_llm()
        self._load_translation_model()

    # ─── Data ────────────────────────────────────────────────────────────────
    def _load_dataset(self) -> None:
        logger.info(f"Loading dataset: {self.DATASET_NAME}")
        dataset = load_dataset(self.DATASET_NAME)
        self.chunks: list[str] = [row["text"] for row in dataset["train"]]
        logger.info(f"Loaded {len(self.chunks)} chunks.")

    # ─── Embeddings + FAISS ──────────────────────────────────────────────────
    def _load_embed_model(self) -> None:
        logger.info(f"Loading embedding model: {self.EMBED_MODEL_NAME}")
        self.embed_model = SentenceTransformer(self.EMBED_MODEL_NAME)

    def _build_faiss_index(self) -> None:
        logger.info("Building FAISS index...")
        embeddings = self.embed_model.encode(
            self.chunks, show_progress_bar=True)
        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(np.array(embeddings))
        logger.info(
            f"FAISS index built with {self.index.ntotal} vectors (dim={dimension}).")

    def retrieve(self, query: str, k: int = 3) -> list[str]:
        """Return the top-k most relevant chunks for a query."""
        query_vec = self.embed_model.encode([query])
        _, indices = self.index.search(np.array(query_vec), k)
        return [self.chunks[i] for i in indices[0]]

    # ─── LLM ─────────────────────────────────────────────────────────────────
    def _load_llm(self) -> None:
        logger.info(f"Loading LLM: {self.LLM_MODEL_NAME}")
        self.llm_tokenizer = AutoTokenizer.from_pretrained(self.LLM_MODEL_NAME)
        self.llm_model = AutoModelForCausalLM.from_pretrained(
            self.LLM_MODEL_NAME,
            torch_dtype=torch.float16,
            device_map="auto",
        )
        logger.info("LLM loaded.")

    @staticmethod
    def _build_prompt(context: str, question: str) -> str:
        return (
            "You are a Customer Service Assistant called COCIS Voice Assistant.\n\n"
            "Rules:\n"
            "- Answer ONLY using the provided context.\n"
            "- If the answer is not in the context, say: I don't know.\n"
            "- Be concise and clear.\n\n"
            f"Context:\n{context}\n\n"
            f"Question:\n{question}\n\n"
            "Answer:"
        )

    def generate_answer(self, question: str) -> str:
        """Retrieve context and generate a grounded English answer."""
        chunks = self.retrieve(question)
        context = "\n".join(chunks)
        prompt = self._build_prompt(context, question)

        inputs = self.llm_tokenizer(
            prompt, return_tensors="pt").to(self.llm_model.device)
        outputs = self.llm_model.generate(
            **inputs,
            max_new_tokens=150,
            temperature=0.3,
            do_sample=True,
        )
        full_text = self.llm_tokenizer.decode(
            outputs[0], skip_special_tokens=True)
        return self._extract_answer(full_text)

    @staticmethod
    def _extract_answer(full_text: str) -> str:
        """Extract the part after 'Answer:' from LLM output."""
        parts = full_text.split("Answer:")
        if len(parts) > 1:
            return parts[1].strip().splitlines()[0].strip()
        return full_text.strip()

    # ─── Translation ─────────────────────────────────────────────────────────
    def _load_translation_model(self) -> None:
        logger.info(f"Loading translation model: {self.TRANSLATE_MODEL_NAME}")
        self.translate_tokenizer = AutoTokenizer.from_pretrained(
            self.TRANSLATE_MODEL_NAME)
        self.translate_model = AutoModelForSeq2SeqLM.from_pretrained(
            self.TRANSLATE_MODEL_NAME)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.translate_model.to(device)
        logger.info(f"Translation model loaded on {device}.")

    def _translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        """Generic translation helper."""
        self.translate_tokenizer.src_lang = LANG_CODES[src_lang]
        inputs = self.translate_tokenizer(text, return_tensors="pt").to(
            self.translate_model.device
        )
        forced_bos = self.translate_tokenizer.convert_tokens_to_ids(
            LANG_CODES[tgt_lang])
        outputs = self.translate_model.generate(
            **inputs,
            forced_bos_token_id=forced_bos,
            max_length=512,
        )
        return self.translate_tokenizer.decode(outputs[0], skip_special_tokens=True)

    def translate_to_english(self, text: str, source_lang: str) -> str:
        return self._translate(text, src_lang=source_lang, tgt_lang="english")

    def translate_from_english(self, text: str, target_lang: str) -> str:
        return self._translate(text, src_lang="english", tgt_lang=target_lang)

    # ─── Main Pipeline ───────────────────────────────────────────────────────
    def multilingual_chat(self, user_input: str, lang: str) -> dict:
        """
        Full pipeline: translate → RAG → generate → translate back.

        Returns a dict with:
            - english_question: the question in English
            - english_answer:   the raw English answer
            - final_answer:     the answer in the requested language
        """
        if lang not in LANG_CODES:
            raise ValueError(
                f"Unsupported language: {lang!r}. Choose from {list(LANG_CODES)}")

        # 1. Translate question to English
        if lang != "english":
            english_question = self.translate_to_english(user_input, lang)
        else:
            english_question = user_input

        logger.info(f"English question: {english_question!r}")

        # 2. RAG + generation
        english_answer = self.generate_answer(english_question)
        logger.info(f"English answer: {english_answer!r}")

        # 3. Translate answer back
        if lang != "english":
            final_answer = self.translate_from_english(english_answer, lang)
        else:
            final_answer = english_answer

        return {
            "english_question": english_question,
            "english_answer": english_answer,
            "final_answer": final_answer,
        }
