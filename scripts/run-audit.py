import re
import os
import hashlib

# C.1: Hashes
css_files = ['client/css/cover.css', 'client/css/form.css', 'client/css/landing.css', 'client/css/print.css', 'client/css/site.css']
FROZEN_COVER_HASH = '055132E855624DF5B83BD91D2E819BBAFAE34CEC0BF5E03064F6AA0D689320EE'

print("=== C.1 CSS HASHES ===")
for cf in sorted(css_files):
    with open(cf, 'rb') as f:
        h = hashlib.sha256(f.read()).hexdigest().upper()
    status = "UNCHANGED" if h == FROZEN_COVER_HASH else ("MANUALLY CHANGED" if cf == 'client/css/cover.css' else "")
    print(f"{cf}: {h} {status}")

# C.2: HTML Structure Audit
print("\n=== C.2 HTML STRUCTURE AUDIT ===")
CONTRACT_IDS = {
    'university', 'department', 'level', 'term', 'course-code', 'course-title',
    'doc-number', 'doc-title', 'comment', 'student-name', 'student-id',
    'experiment-date', 'submission-date', 'doc-type-lab', 'doc-type-assignment',
    'logo-upload', 'add-teacher', 'teachers-form-container', 'teachers-fieldset',
    'clear-form', 'storage-status', 'print-cover'
}

html_files = ['client/index.html', 'client/create.html']
for hf in html_files:
    with open(hf, 'r', encoding='utf-8') as f:
        content = f.read()
    
    ids = sorted(list(set(re.findall(r'id=["\']([^"\']+)["\']', content))))
    classes = set()
    for m in re.findall(r'class=["\']([^"\']+)["\']', content):
        for c in m.split():
            classes.add(c)
    classes = sorted(list(classes))
    data_fields = sorted(list(set(re.findall(r'data-field=["\']([^"\']+)["\']', content))))
    cover_types = sorted(list(set(re.findall(r'data-cover-type=["\']([^"\']+)["\']', content))))
    
    print(f"\n--- {hf} ---")
    print(f"Total IDs: {len(ids)}")
    print(f"IDs: {ids}")
    print(f"Total Classes: {len(classes)}")
    print(f"Classes: {classes}")
    print(f"data-field attributes: {data_fields}")
    print(f"data-cover-type values: {cover_types}")
    
    if hf == 'client/create.html':
        create_ids = set(ids)
        missing_contract_ids = sorted(list(CONTRACT_IDS - create_ids))
        extra_ids = sorted(list(create_ids - CONTRACT_IDS))
        print(f"\nContract IDs missing in create.html: {missing_contract_ids}")
        print(f"Extra IDs in create.html: {extra_ids}")


# C.3: CSS Audit
print("\n=== C.3 CSS AUDIT ===")

all_css = {}
all_classes_in_css = set()
all_ids_in_css = set()

for cf in css_files:
    with open(cf, 'r', encoding='utf-8') as f:
        content = f.read()
    all_css[cf] = content
    # find classes
    for c in re.findall(r'\.([a-zA-Z0-9_-]+)', content):
        all_classes_in_css.add(c)
    # find ids
    for i in re.findall(r'#([a-zA-Z0-9_-]+)', content):
        all_ids_in_css.add(i)

# Union of HTML classes and ids
all_html_classes = set()
all_html_ids = set()
for hf in html_files:
    with open(hf, 'r', encoding='utf-8') as f:
        c = f.read()
    for m in re.findall(r'class=["\']([^"\']+)["\']', c):
        for cl in m.split():
            all_html_classes.add(cl)
    for i in re.findall(r'id=["\']([^"\']+)["\']', c):
        all_html_ids.add(i)

unstyled_classes = sorted(list(all_html_classes - all_classes_in_css))
print(f"Unstyled HTML classes ({len(unstyled_classes)}): {unstyled_classes}")

dead_css_classes = sorted([c for c in all_classes_in_css if c not in all_html_classes])
print(f"Dead CSS classes count: {len(dead_css_classes)}")
print(f"Sample Dead CSS classes: {dead_css_classes[:25]}")

unstyled_ids = sorted(list(all_html_ids - all_ids_in_css))
print(f"HTML IDs with no CSS rule ({len(unstyled_ids)}): {unstyled_ids}")

# Design discipline scan
print("\n--- Design Discipline Scan ---")
files_to_scan = [
    'client/index.html', 'client/create.html',
    'client/css/cover.css', 'client/css/form.css',
    'client/css/landing.css', 'client/css/print.css', 'client/css/site.css'
]

for fp in files_to_scan:
    with open(fp, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    for idx, line in enumerate(lines, 1):
        # gradient
        if re.search(r'(?:linear|radial|conic)-gradient', line, re.I):
            print(f"[DISCIPLINE - GRADIENT] {fp}:{idx} -> {line.strip()}")
        # backdrop-filter or blur
        if re.search(r'backdrop-filter|filter:\s*blur', line, re.I):
            print(f"[DISCIPLINE - BLUR/BACKDROP] {fp}:{idx} -> {line.strip()}")
        # non-neutral box-shadow
        if 'box-shadow' in line:
            rgba_matches = re.findall(r'rgba\([^)]+\)', line, re.I)
            for r in rgba_matches:
                if not re.search(r'^rgba\(\s*(?:15,\s*23,\s*42|0,\s*0,\s*0|0,\s*31,\s*63)\s*,', r, re.I):
                    print(f"[DISCIPLINE - SHADOW RGBA] {fp}:{idx} -> {r} in {line.strip()}")
            hex_shadows = re.findall(r'#[0-9a-fA-F]{6,8}', line)
            for h in hex_shadows:
                print(f"[DISCIPLINE - SHADOW HEX] {fp}:{idx} -> {h} in {line.strip()}")
        # purple/indigo/violet hue hexes: R and B both > G + 20
        hexes = re.findall(r'#([0-9a-fA-F]{6})\b', line)
        for h in hexes:
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            if r > g + 20 and b > g + 20:
                print(f"[DISCIPLINE - PURPLE/INDIGO] {fp}:{idx} -> #{h} (R={r}, G={g}, B={b}) in {line.strip()}")
        # emoji codepoints
        for ch in line:
            cp = ord(ch)
            if (0x1f300 <= cp <= 0x1faff) or (0x2600 <= cp <= 0x27bf):
                print(f"[DISCIPLINE - EMOJI] {fp}:{idx} -> U+{cp:04X} in {line.strip()}")
            # unicode-as-icon outside allowed arrows
            if 0x2190 <= cp <= 0x21ff:
                if ch == '→' and 'Create a cover page →' not in line:
                    print(f"[DISCIPLINE - ARROW '→'] {fp}:{idx} -> in {line.strip()}")
                elif ch == '←' and '← Back to home' not in line:
                    print(f"[DISCIPLINE - ARROW '←'] {fp}:{idx} -> in {line.strip()}")
