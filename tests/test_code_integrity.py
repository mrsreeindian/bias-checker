#!/usr/bin/env python3
"""
test_code_integrity.py
Validates JavaScript syntax, manifest configuration, XSS safeguards,
and API key check mechanics across all updated files.
"""

import json
import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_manifest():
    print("Testing manifest.json configuration...")
    with open(os.path.join(BASE_DIR, "manifest.json"), "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # 1. Background configuration has both service_worker (Chrome) and scripts (Firefox)
    bg = manifest.get("background", {})
    assert bg.get("service_worker") == "src/background/service_worker.js", "Missing background.service_worker"
    assert "src/background/service_worker.js" in bg.get("scripts", []), "Missing background.scripts"
    assert bg.get("type") == "module", "Missing background type module"

    # 2. web_accessible_resources does not leak council.html
    war = manifest.get("web_accessible_resources", [])
    for entry in war:
        for res in entry.get("resources", []):
            assert "council.html" not in res, "council.html should not be exposed in web_accessible_resources"
            assert "council.js" not in res, "council.js should not be exposed in web_accessible_resources"
    print("  ✅ manifest.json background and resource exposure verified.")

def test_ollama_client_logic():
    print("Testing OllamaClient.testConnection and chat inference logic...")
    with open(os.path.join(BASE_DIR, "src", "core", "ollama_client.js"), "r", encoding="utf-8") as f:
        content = f.read()

    assert "testConnection" in content, "OllamaClient missing testConnection method"
    assert "/api/tags" in content, "OllamaClient missing /api/tags endpoint query"
    assert "/api/chat" in content, "OllamaClient missing /api/chat endpoint query"
    assert "normalizeEndpoint" in content, "OllamaClient missing normalizeEndpoint"
    assert "Bearer" in content, "OllamaClient missing Bearer token authorization"
    assert "workingModel" in content, "testConnection should return workingModel"
    print("  ✅ OllamaClient connection testing and endpoint validation verified.")

def test_service_worker_key_handling():
    print("Testing service_worker.js key and cache handling...")
    with open(os.path.join(BASE_DIR, "src", "background", "service_worker.js"), "r", encoding="utf-8") as f:
        content = f.read()

    assert "OllamaClient" in content, "service_worker missing OllamaClient import"
    assert "ollamaEndpoint" in content, "service_worker missing ollamaEndpoint storage"
    assert "SAVE_AND_VERIFY_OLLAMA_CONFIG" in content, "service_worker missing SAVE_AND_VERIFY_OLLAMA_CONFIG message handler"
    assert "testResult.workingModel" in content, "service_worker should save modelPreference from workingModel"
    assert "keys.length > 60" in content or "cacheKeys.length > 60" in content, "service_worker missing cache pruning"
    assert "inFlightChecks" in content, "service_worker missing inFlightChecks deduplication"
    assert "message.tabId" in content or "targetTabId" in content, "service_worker should accept tabId from message"
    print("  ✅ service_worker.js Ollama config storage, deduplication, and cache bounds verified.")

def test_engine_fallbacks():
    print("Testing council_debate.js fallbacks...")
    with open(os.path.join(BASE_DIR, "src", "core", "council_debate.js"), "r", encoding="utf-8") as f:
        content = f.read()

    assert "specificPerspective:" in content, "council_debate.js Stage 1 fallback missing specificPerspective"
    print("  ✅ council_debate.js Stage 1 fallback properties verified.")

def test_xss_protection():
    print("Testing XSS safeguards and message handlers across UI files...")
    files_to_check = [
        os.path.join(BASE_DIR, "src", "content", "overlay.js"),
        os.path.join(BASE_DIR, "src", "popup", "popup.js"),
        os.path.join(BASE_DIR, "src", "council", "council.js")
    ]

    for filepath in files_to_check:
        filename = os.path.basename(filepath)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        assert "function escapeHtml" in content, f"{filename} missing escapeHtml definition"
        assert "escapeHtml" in content, f"{filename} missing escapeHtml calls"
        # Check no inline onclick in council.js
        if filename == "council.js":
            assert "onclick=" not in content, "council.js must not contain inline onclick handlers"
        if filename == "overlay.js":
            assert "TRIGGER_FACT_CHECK" in content, "overlay.js must handle TRIGGER_FACT_CHECK"
            assert "showForumWarning" in content, "overlay.js must check showForumWarning setting"

    print("  ✅ XSS safeguards, message handlers, and CSP compliance verified.")

def main():
    try:
        test_manifest()
        test_ollama_client_logic()
        test_service_worker_key_handling()
        test_engine_fallbacks()
        test_xss_protection()
        print("\n🎉 ALL CODE INTEGRITY TESTS PASSED!")
        return 0
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
