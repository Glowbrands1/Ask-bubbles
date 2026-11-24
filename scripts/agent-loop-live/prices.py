"""Model prices per million tokens for the live sample's cost (dev only; mirrors src/lib/ai/model-prices.ts)."""
import os

# input, output, cache read, cache write
OPUS = (5, 25, 0.5, 6.25)
SONNET = (2, 10, 0.2, 2.5)


def prices() -> tuple:
    """The prices of the model the run uses (ANTHROPIC_MODEL, else the loop's default Sonnet); unknown models cost as Opus."""
    model = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-5"
    if model.startswith("claude-sonnet"):
        return SONNET
    return OPUS
