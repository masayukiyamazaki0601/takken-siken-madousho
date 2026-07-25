import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 民法大改正（2020年4月）以降の試験：R2〜R7
const PDFS = [
  { year: 'R7', url: 'https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf' },
  { year: 'R6', url: 'https://www.retio.or.jp/wp-content/uploads/2025/03/R6_question_answer.pdf' },
  { year: 'R5', url: 'https://www.retio.or.jp/wp-content/uploads/2025/03/R5_qestion_answer　.pdf' },
  { year: 'R4', url: 'https://www.retio.or.jp/wp-content/uploads/2024/10/R4-q_a.pdf' },
  { year: 'R3', url: 'https://www.retio.or.jp/wp-content/uploads/2024/12/R3-question.pdf' },
  { year: 'R2', url: 'https://www.retio.or.jp/wp-content/uploads/2024/10/R2-question_002.pdf' },
];

// 問題番号 → 分野タグ・エリアの対応（宅建試験の出題順固定）
const QUESTION_MAP = [
  // 問1-13: 権利関係（民法）
  ...[1,2,3,4,5,6,7,8,9,10,11,12,13].map(n => ({ tag: '権利関係', area: 'r' })),
  // 問14-18: 法令上の制限
  ...[14,15,16,17,18].map(n => ({ tag: '法令上の制限', area: 'l' })),
  // 問19-22: 稅
  ...[19,20,21,22].map(n => ({ tag: '稅', area: 'z' })),
  // 問23-24: 不動産鑑定評価
  ...[23,24].map(n => ({ tag: '鑑定評価', area: 't' })),
  // 問25-45: 宅建業法
  ...[25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45].map(n => ({ tag: '宅建業法', area: 't' })),
  // 問46-50: 土地・建物需給＋統計
  ...[46,47,48,49,50].map(n => ({ tag: '統計その他', area: 'z' })),
];

async function downloadPdf(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`  ${dest} 既存、スキップ`);
    return;
  }
  console.log(`  Downloading ${url}...`);
  execSync(`curl -sL -o "${dest}" "${url}"`, { stdio: 'pipe', timeout: 60000 });
}

function extractQuestions(text, year) {
  const questions = [];
  
  // 正解リストを抽出（末尾の50個の数字1-4を行単位で）
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const answerNums = [];
  for (const line of lines) {
    if (/^[1-4]$/.test(line)) answerNums.push(parseInt(line) - 1);
    if (answerNums.length >= 50) break;
  }
  // 末尾から50個取る
  const answers = answerNums.slice(-50);
  
  // 【問N】で分割（Nは半角数字1-2桁）
  const blocks = text.split(/【問\s*(\d{1,2})】/);
  
  for (let i = 1; i < blocks.length - 1; i += 2) {
    const qNum = parseInt(blocks[i]);
    const block = blocks[i + 1];
    if (!block || qNum < 1 || qNum > 50) continue;
    
    // 選択肢を「数字+テキスト」のパターンで抽出
    // 1から始まる選択肢ブロックを取得
    const optLines = block.split('\n').map(l => l.trim()).filter(l => l);
    
    // 最初の行が問題文（選択肢数字で始まらない最初のテキスト行）
    let qText = '';
    const opts = [];
    let currentOpt = null;
    
    for (const line of optLines) {
      // 「1   テキスト」または「1テキスト」のパターン
      const optMatch = line.match(/^(\d)\s*(.+)/);
      if (optMatch) {
        const num = parseInt(optMatch[1]);
        if (num >= 1 && num <= 4) {
          if (currentOpt !== null) opts.push(currentOpt);
          currentOpt = optMatch[2];
          continue;
        }
      }
      // ア〜エの特殊選択肢パターン
      const kanaMatch = line.match(/^[アカサタナハマヤラワ]\s*(.+)/);
      if (kanaMatch && currentOpt) {
        currentOpt += ' ' + kanaMatch[0];
        continue;
      }
      // 問題文または選択肢の続き
      if (currentOpt !== null) {
        currentOpt += ' ' + line;
      } else if (!qText && line.length > 5 && !line.match(/^\d+$/)) {
        qText = line;
      }
    }
    if (currentOpt !== null) opts.push(currentOpt);
    
    // 4択に整形（最大4つ）
    const cleanOpts = opts.map(o => o.replace(/\s+/g, ' ').trim()).filter(o => o.length > 1).slice(0, 4);
    
    if (cleanOpts.length >= 2 && qText.length > 5) {
      const correctIdx = answers[qNum - 1] !== undefined ? answers[qNum - 1] : 0;
      const map = QUESTION_MAP[qNum - 1] || { tag: 'その他', area: 'r' };
      questions.push({
        q: qText.replace(/\s+/g, ' ').trim(),
        a: cleanOpts,
        c: Math.min(correctIdx, cleanOpts.length - 1),
        tag: map.tag,
        area: map.area,
        year: year
      });
    }
  }
  
  return questions;
}

async function main() {
  console.log('=== 宅建試験PDF 一括取得 + パース ===\n');
  
  const tmpDir = 'pdf_tmp';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
  
  let allQuestions = [];
  const seen = new Set();
  
  for (const { year, url } of PDFS) {
    const pdfPath = path.join(tmpDir, `${year}.pdf`);
    console.log(`\n[${year}] ダウンロード中...`);
    
    // URLエンコード対応
    const encodedUrl = url.replace(/　/g, '%E3%80%80');
    try {
      await downloadPdf(encodedUrl, pdfPath);
    } catch (e) {
      console.log(`  ${year}: ダウンロード失敗 → 別URL試行`);
      // R5のPDF名が不正確なので代替
      if (year === 'R5') {
        execSync(`curl -sL -o "${pdfPath}" "https://www.retio.or.jp/wp-content/uploads/2025/03/R5_qestion_answer.pdf"`, { stdio: 'pipe', timeout: 30000 });
      }
      continue;
    }
    
    // テキスト変換
    const txtPath = pdfPath.replace('.pdf', '.txt');
    try {
      execSync(`pdftotext -layout "${pdfPath}" "${txtPath}"`, { stdio: 'pipe', timeout: 30000 });
    } catch (e) {
      console.log(`  ${year}: pdftotext失敗`);
      continue;
    }
    
    const text = fs.readFileSync(txtPath, 'utf-8');
    const questions = extractQuestions(text, year);
    console.log(`  ${questions.length}問抽出`);
    
    for (const q of questions) {
      const key = q.q.substring(0, 30);
      if (!seen.has(key)) {
        allQuestions.push(q);
        seen.add(key);
      }
    }
  }
  
  console.log(`\n=== 合計: ${allQuestions.length}問 ===`);
  fs.writeFileSync('questions_from_pdf.json', JSON.stringify(allQuestions, null, 2), 'utf-8');
  console.log('questions_from_pdf.json に保存完了');
  
  // クリーンアップ
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(console.error);