"""將核准內容從公開試算表或本機 CSV 匯出。僅使用標準函式庫。"""
import argparse
import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / 'tools/schema.json').read_text(encoding='utf-8'))
PRIVATE = {'審核狀態', '來源', '備註'}


def convert(tab, text):
    reader = csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    fields = reader.fieldnames or []
    missing = [k for k in SCHEMA[tab] if k not in fields]
    if missing:
        raise ValueError(f'{tab}：缺少欄位：{"、".join(missing)}')
    named = [k.strip() for k in fields if k.strip()]  # gviz 會把空白欄補成空欄名，略過
    if len(named) != len(set(named)):
        raise ValueError(f'{tab}：欄名重複')
    rows, seen, skipped = [], {}, 0
    for number, row in enumerate(reader, 2):
        if None in row:
            raise ValueError(f'{tab} 第 {number} 列：欄數超出標頭')
        if not any((v or '').strip() for v in row.values()):
            continue
        ident = (row.get('id') or '').strip()
        if not ident:
            raise ValueError(f'{tab} 第 {number} 列：id 空白')
        if ident in seen:
            raise ValueError(f'{tab} 第 {number} 列：id 重複 {ident}（首次出現於第 {seen[ident]} 列）')
        seen[ident] = number
        if (row.get('審核狀態') or '').strip() != '已核准':
            skipped += 1
            continue
        item = {k: row.get(k) or '' for k in SCHEMA[tab] if k not in PRIVATE}
        for key in ('排序', '順序', '難度'):
            if key in item:
                try:
                    item[key] = int(item[key].strip())
                except ValueError:
                    raise ValueError(f'{tab} 第 {number} 列：{key} 必須是整數') from None
        if tab == '測驗':
            answer = item.pop('正解').strip()
            options = [(letter, item.pop('選項' + letter)) for letter in 'ABCD']
            options = [(letter, value) for letter, value in options if value.strip()]
            letters = [letter for letter, _ in options]
            if answer not in letters:
                raise ValueError(f'{tab} 第 {number} 列：正解無效或指向空白選項：{answer}')
            item['options'] = [value for _, value in options]
            item['answer'] = letters.index(answer)
        rows.append(item)
    sort_key = next((k for k in ('排序', '順序') if k in SCHEMA[tab]), None)
    if sort_key:
        rows.sort(key=lambda row: row[sort_key])
    return rows, skipped


def run(config, from_dir=None, output_dir=None):
    output_dir = Path(output_dir) if output_dir else ROOT / 'data'
    results, errors, invalid = {}, [], False
    if not from_dir and not config.get('sheet_id'):
        print('錯誤：sheet_id 尚未設定，請填寫設定檔或使用 --from-dir。')
        return 1
    for tab, filename in config['tabs'].items():
        try:
            if tab not in SCHEMA:
                raise ValueError(f'{tab}：未知分頁')
            if Path(filename).name != filename or not filename.endswith('.json'):
                raise ValueError(f'{tab}：匯出檔名必須是單一 JSON 檔名')
            if from_dir:
                source = (Path(from_dir) / f'{tab}.csv').read_text(encoding='utf-8-sig')
            else:
                url = ('https://docs.google.com/spreadsheets/d/' + quote(config['sheet_id'], safe='')
                       + '/gviz/tq?' + urlencode({'tqx': 'out:csv', 'sheet': tab}))
                with urlopen(url, timeout=30) as response:
                    source = response.read().decode('utf-8-sig')
        except ValueError as exc:
            invalid = True
            errors.append(str(exc))
            continue
        except (OSError, UnicodeError) as exc:
            errors.append(f'{tab}：讀取失敗：{exc}')
            continue
        try:
            results[tab] = (filename, *convert(tab, source))
        except (ValueError, csv.Error) as exc:
            invalid = True
            errors.append(str(exc))
    print('分頁\t匯出筆數\t略過未核准')
    for tab, (_, rows, skipped) in results.items():
        print(f'{tab}\t{len(rows)}\t{skipped}')
    for error in errors:
        print('錯誤：' + error)
    if invalid:
        print('資料驗證失敗，本次未寫入任何檔案。')
        return 1
    output_dir.mkdir(parents=True, exist_ok=True)
    def write(name, value):
        (output_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for filename, rows, _ in results.values():
        write(filename, rows)
    write('_export_info.json', {
        '匯出時間': datetime.now(timezone.utc).isoformat(),
        '來源': str(Path(from_dir).resolve()) if from_dir else 'Google 試算表：' + config['sheet_id'],
        '檔案': {filename: {'筆數': len(rows), '略過未核准': skipped} for filename, rows, skipped in results.values()},
        '錯誤': errors,
    })
    return int(bool(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-dir', type=Path)
    args = parser.parse_args()
    try:
        config = json.loads((ROOT / 'tools/content_config.json').read_text(encoding='utf-8'))
        return run(config, args.from_dir)
    except (OSError, ValueError, KeyError) as exc:
        print(f'錯誤：{exc}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
