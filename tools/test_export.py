"""匯出功能與離線流程測試。"""
import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import export_content as export

FIXTURES = Path(__file__).resolve().parent / 'test_fixtures'
CONFIG = json.loads((Path(__file__).resolve().parent / 'content_config.json').read_text(encoding='utf-8'))


def make_csv(tab, rows, fields=None):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields or export.SCHEMA[tab])
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def create_fixtures():
    FIXTURES.mkdir(exist_ok=True)
    for tab, fields in export.SCHEMA.items():
        rows = []
        for i, status in enumerate([' 已核准 ', '待審', '草稿', '退回', '已核准']):
            row = {k: '測試狐獴假資料' for k in fields}
            row.update({'id': f'test_{i}', '審核狀態': status})
            for key in ('排序', '順序', '難度'):
                if key in fields:
                    row[key] = str(2 if i == 0 else 1)
            if tab == '測驗':
                row.update({'選項A': '測試甲', '選項B': '', '選項C': '測試丙', '選項D': '', '正解': 'C'})
            rows.append(row)
        rows.append({})
        (FIXTURES / f'{tab}.csv').write_text(make_csv(tab, rows), encoding='utf-8-sig')


class ExportTests(unittest.TestCase):
    def source(self, tab):
        return (FIXTURES / f'{tab}.csv').read_text(encoding='utf-8-sig')

    def test_approved_and_private_columns(self):
        for tab in export.SCHEMA:
            with self.subTest(tab=tab):
                rows, skipped = export.convert(tab, self.source(tab))
                self.assertEqual(len(rows), 2)
                self.assertEqual(skipped, 3)
                self.assertTrue(all(not export.PRIVATE.intersection(row) for row in rows))

    def test_numbers_and_sort(self):
        for tab, key in [('展區', '排序'), ('保育員對話', '順序'), ('測驗', '難度')]:
            rows, _ = export.convert(tab, self.source(tab))
            self.assertTrue(all(type(row[key]) is int for row in rows))
            if key != '難度':
                self.assertEqual([row[key] for row in rows], [1, 2])

    def test_options_answer(self):
        rows, _ = export.convert('測驗', self.source('測驗'))
        self.assertEqual(rows[0]['options'], ['測試甲', '測試丙'])
        self.assertEqual(rows[0]['answer'], 1)
        self.assertNotIn('正解', rows[0])
        self.assertNotIn('選項A', rows[0])

    def test_blank_answer_option(self):
        source = self.source('測驗').replace(',C,', ',B,')
        with self.assertRaisesRegex(ValueError, '測驗 第 2 列.*空白選項'):
            export.convert('測驗', source)

    def test_duplicate_id(self):
        with self.assertRaisesRegex(ValueError, '展區 第 3 列.*首次.*2'):
            export.convert('展區', self.source('展區').replace('test_1', 'test_0'))

    def test_blank_id(self):
        with self.assertRaisesRegex(ValueError, '展區 第 2 列.*id 空白'):
            export.convert('展區', self.source('展區').replace('test_0', ''))

    def test_missing_column(self):
        with self.assertRaisesRegex(ValueError, '展區.*缺少欄位：名稱'):
            export.convert('展區', self.source('展區').replace('名稱', '錯誤欄名', 1))

    def test_invalid_integer(self):
        with self.assertRaisesRegex(ValueError, '排序 必須是整數'):
            export.convert('展區', self.source('展區').replace(',2,', ',abc,'))

    def test_validation_writes_nothing(self):
        with tempfile.TemporaryDirectory(dir=export.ROOT) as temp:
            out = Path(temp) / 'output'
            with patch.object(export, 'convert', side_effect=ValueError('重複 id')), redirect_stdout(io.StringIO()):
                self.assertEqual(export.run(CONFIG, FIXTURES, out), 1)
            self.assertFalse(out.exists())

    def test_offline_export_and_metadata(self):
        with tempfile.TemporaryDirectory(dir=export.ROOT) as temp, redirect_stdout(io.StringIO()):
            out = Path(temp)
            self.assertEqual(export.run(CONFIG, FIXTURES, out), 0)
            self.assertEqual(len(list(out.glob('*.json'))), 10)
            info = json.loads((out / '_export_info.json').read_text(encoding='utf-8'))
            self.assertEqual(info['檔案']['areas.json'], {'筆數': 2, '略過未核准': 3})

    def test_read_failure_continues(self):
        with tempfile.TemporaryDirectory(dir=export.ROOT) as temp, redirect_stdout(io.StringIO()):
            out = Path(temp)
            original = Path.read_text
            def read(path, *args, **kwargs):
                if path.name == '展區.csv':
                    raise FileNotFoundError('測試分頁不存在')
                return original(path, *args, **kwargs)
            with patch.object(Path, 'read_text', read):
                self.assertEqual(export.run(CONFIG, FIXTURES, out), 1)
            self.assertFalse((out / 'areas.json').exists())
            self.assertTrue((out / 'animals.json').exists())


if __name__ == '__main__':
    unittest.main()
