"""Novelty check module.

Paper summary extraction, multi-angle novelty identification,
Deep Research integration, and originality assessment
for peer review.

Phases:
    1. novelty-summarize            — LLM: extract paper summary + novelty angles
    2. novelty-deep-research-prompt — Fill Deep Research prompt template (no LLM)
    3. (user pastes results)        — Saved to deep_research_input.txt via frontend
    4. novelty-assess               — LLM: compare against literature search results
    5. novelty-review-comment       — LLM: generate review comment section
"""
