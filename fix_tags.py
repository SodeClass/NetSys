import re
import sys

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 既に [] で囲まれている場合は除外して、文字列を変換する
        def replacer(match):
            indent = match.group(1)
            tags_str = match.group(2)
            if tags_str.strip().startswith('['):
                return match.group(0) # 既にリスト形式ならそのまま
            tags = [t.strip() for t in tags_str.split(',')]
            tags_formatted = ', '.join(f'"{t}"' for t in tags)
            return f'{indent}tag: [{tags_formatted}]'
        
        new_content = re.sub(r'^(\s*)tag:\s*(.+)$', replacer, content, flags=re.MULTILINE)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Successfully processed {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}", file=sys.stderr)

process_file('content/server_intro.yml')
process_file('content/personal_site.yml')
