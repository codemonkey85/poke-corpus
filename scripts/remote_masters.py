import glob
import json
import os.path
import re
import subprocess

REPO_URL = "https://github.com/abcboy101/masters-text.git"
REPO_PATH = "./remote/masters-text"
INPUT_FOLDERS = [
    os.path.join(REPO_PATH, "Messages"),
    os.path.join(REPO_PATH, "Messages/talk"),
    os.path.join(REPO_PATH, "Messages/ui"),
]
OUTPUT_FOLDER = "./corpus/Masters"


def convert_lang(lang: str) -> str:
    match lang:
        case 'zh-TW':
            return 'zh-Hant'
    return lang


def make_id(key: str, filename: str, prefix: str):
    assert '^' not in key
    key = key.replace('.', '^')
    entries = ['masters', prefix, filename, key]
    if key.startswith(filename + '/'):
        entries[3] = key.removeprefix(filename + '/')
    if prefix == 'messages':
        entries.pop(1)
    return '.'.join(entries)


# Clone/pull remote repository
if not os.path.exists(REPO_PATH) or len(os.listdir(REPO_PATH)) == 0:
    print(f'Downloading repository...')
    subprocess.run(['git', 'clone', '--filter=blob:none', REPO_URL, REPO_PATH], check=True)

print(f'Checking if repository is up to date...')
subprocess.run(['git', 'pull'], cwd=REPO_PATH, check=True)

# Check modified time
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
src_times = [os.path.getmtime(path) for path in glob.iglob(os.path.join(REPO_PATH, '**/*.json'), recursive=True)]
dst_times = [os.path.getmtime(path) for path in glob.iglob(os.path.join(OUTPUT_FOLDER, '*.txt'))]
if dst_times and max(dst_times) >= max(src_times):
    print(f'No changes found')
    exit()

# Combine each folder separately
for folder_path in INPUT_FOLDERS:
    map: dict[str, dict[str, dict[str, str]]] = {}
    lang_list = []
    folder = os.path.basename(folder_path).lower()

    # Load the source data in all languages
    print(f'Loading files for {folder}...')
    for path in glob.iglob(os.path.join(folder_path, '*.json')):
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        base = os.path.basename(path)
        file, lang = re.search(r'(.+)_([^_]+?)\.json', base).groups()
        if lang not in lang_list:
            lang_list.append(lang)

        map.setdefault(file, {})
        for sid, string_text in data.items():
            sid = make_id(sid.replace('\\', '\\\\').replace('\n', '\\n'), file, folder)
            map[file].setdefault(sid, {})[lang] = string_text
        # print(f'Loaded {base}')

    # Write the text files in all languages
    print(f'Writing files for {folder}...')
    try:
        lang_files = {code: open(os.path.join(OUTPUT_FOLDER, f'{convert_lang(code)}_{folder}.txt'), 'w', encoding='utf-8') for code in lang_list}
        with open(os.path.join(OUTPUT_FOLDER, f'qid_{folder}.txt'), 'w', encoding='utf-8') as qid:
            for file in sorted(map):
                for f in [qid, *lang_files.values()]:
                    f.write(f'~~~~~~~~~~~~~~~\nText File : {file}\n~~~~~~~~~~~~~~~\n')
                for sid, lang_text in map[file].items():
                    qid.write(f'{sid}\n')
                    for lang in lang_list:
                        f = lang_files[lang]
                        text = lang_text.get(lang, '[NULL]')
                        f.write(text.replace('\\', '\\\\').replace('\n', '\\n'))
                        f.write('\n')
    finally:
        for f in lang_files.values():
            f.close()

print('Done!')
