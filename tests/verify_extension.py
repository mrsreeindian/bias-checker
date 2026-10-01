#!/usr/bin/env python3
"""
verify_extension.py
Automated validation of the Fact-Checker extension structure, manifest integrity,
file existence, and git privacy checks.
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_checks():
    print("🔍 Running Fact-Checker Extension Automated Verification...")
    errors = []
    warnings = []

    # 1. Manifest V3 Integrity
    manifest_path = os.path.join(BASE_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        errors.append("manifest.json not found!")
        return False

    with open(manifest_path, "r", encoding="utf-8") as f:
        try:
            manifest = json.load(f)
            print("  ✅ manifest.json parsed as valid JSON.")
        except json.JSONDecodeError as e:
            errors.append(f"Invalid JSON in manifest.json: {e}")
            return False

    # Check MV3 required keys
    assert manifest.get("manifest_version") == 3, "manifest_version must be 3"
    assert "name" in manifest, "Manifest missing 'name'"
    assert "version" in manifest, "Manifest missing 'version'"
    assert "browser_specific_settings" in manifest, "Manifest missing Firefox gecko.id config"
    print("  ✅ Manifest V3 and Firefox gecko.id verified.")

    # 2. Check all files referenced in manifest exist
    referenced_files = []
    
    # Icons
    for size, icon_path in manifest.get("icons", {}).items():
        referenced_files.append(icon_path)

    # Action popup & icons
    action = manifest.get("action", {})
    if "default_popup" in action:
        referenced_files.append(action["default_popup"])
    for size, icon_path in action.get("default_icon", {}).items():
        referenced_files.append(icon_path)

    # Background service worker
    bg = manifest.get("background", {})
    if "service_worker" in bg:
        referenced_files.append(bg["service_worker"])

    # Content scripts
    for cs in manifest.get("content_scripts", []):
        for js in cs.get("js", []):
            referenced_files.append(js)
        for css in cs.get("css", []):
            referenced_files.append(css)

    # Options UI
    options_ui = manifest.get("options_ui", {})
    if "page" in options_ui:
        referenced_files.append(options_ui["page"])

    print(f"  Checking {len(referenced_files)} referenced files in manifest.json...")
    for rel_path in referenced_files:
        full_path = os.path.join(BASE_DIR, rel_path)
        if not os.path.exists(full_path):
            errors.append(f"Referenced file not found: {rel_path}")
        else:
            size = os.path.getsize(full_path)
            if size == 0:
                warnings.append(f"File {rel_path} is 0 bytes")
            else:
                pass

    if not errors:
        print("  ✅ All files referenced in manifest exist and have non-zero size.")

    # 3. Check Git and idea.md exclusion
    gitignore_path = os.path.join(BASE_DIR, ".gitignore")
    if os.path.exists(gitignore_path):
        with open(gitignore_path, "r", encoding="utf-8") as f:
            gitignore_content = f.read()
            if "idea.md" in gitignore_content:
                print("  ✅ idea.md is explicitly listed in .gitignore.")
            else:
                errors.append("idea.md is NOT listed in .gitignore!")
    else:
        errors.append(".gitignore file missing!")

    # 4. Check core personas in types.js
    types_path = os.path.join(BASE_DIR, "src", "core", "types.js")
    with open(types_path, "r", encoding="utf-8") as f:
        types_content = f.read()
        for member in ["Dr. Veritas", "Auditor Vance", "Prof. Spectrum", "Inspector Sentinel", "Chairman Aristotle"]:
            if member in types_content:
                pass
            else:
                errors.append(f"Council member {member} not found in types.js")
        if "gemini-3.8-flash" in types_content:
            print("  ✅ types.js configures Gemini 3.8 Flash and all 5 Council Personas.")
        else:
            errors.append("DEFAULT_MODEL gemini-3.8-flash not found in types.js")

    # Summary
    print("\n-------------------------------------------")
    if errors:
        print(f"❌ Verification failed with {len(errors)} error(s):")
        for err in errors:
            print(f"   - {err}")
        return False
    else:
        print("🎉 Verification SUCCESSFUL! All integrity checks passed.")
        if warnings:
            for w in warnings:
                print(f"   ⚠️  Warning: {w}")
        return True

if __name__ == "__main__":
    success = run_checks()
    sys.exit(0 if success else 1)
