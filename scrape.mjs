import puppeteer from 'puppeteer';
import fs from 'fs';

// カテゴリ設定（分野, カテゴリID, カテゴリ名, エリア記号）
const CATEGORIES = [
  // 権利関係 (rights)
  ['1','1_1','制限行為能力者','r'],
  ['1','1_2','意思表示','r'],
  ['1','1_3','代理','r'],
  ['1','1_4','時効','r'],
  ['1','1_5','所有権・占有権・用益物権','r'],
  ['1','1_6','担保物権','r'],
  ['1','1_7','債権総則','r'],
  ['1','1_8','売買契約','r'],
  ['1','1_9','賃貸借契約','r'],
  ['1','1_10','その他の契約','r'],
  ['1','1_11','不法行為','r'],
  ['1','1_13','家族法（親族・相続）','r'],
  ['1','1_14','借地借家法（土地）','r'],
  ['1','1_15','借地借家法（建物）','r'],
  ['1','1_16','区分所有法','r'],
  ['1','1_17','不動産登記法','r'],
  // 法令上の制限 (regulations)
  ['2','2_1','都市計画法','l'],
  ['2','2_2','建築基準法','l'],
  ['2','2_3','国土利用計画法','l'],
  ['2','2_4','農地法','l'],
  ['2','2_5','土地区画整理法','l'],
  ['2','2_6','盛土規制法','l'],
  ['2','2_7','その他の法令','l'],
  // 税 (tax)
  ['3','3_1','不動産取得税','z'],
  ['3','3_2','固定資産税','z'],
  ['3','3_3','所得税','z'],
  ['3','3_4','印紙税','z'],
  ['3','3_5','登録免許税','z'],
  // 不動産鑑定評価 (rea, 鑑定評価はrea扱い)
  ['4','4_1','地価公示法','t'],
  ['4','4_2','不動産鑑定評価基準','t'],
  // 宅建業法 (rea)
  ['5','5_1','宅建業法・免許','t'],
  ['5','5_2','宅地建物取引士','t'],
  ['5','5_3','営業保証金','t'],
  ['5','5_4','保証協会','t'],
  ['5','5_5','業務上の規制','t'],
  ['5','5_6','媒介契約','t'],
  ['5','5_7','35条書面','t'],
  ['5','5_8','37条書面','t'],
  ['5','5_9','8種制限','t'],
  ['5','5_10','報酬関連','t'],
  ['5','5_11','監督処分・罰則','t'],
  ['5','5_12','住宅瑕疵担保責任履行法','t'],
  // 土地建物需給 (tax)
  ['6','6_1','住宅金融支援機構法','z'],
  ['6','6_2','不当景品表示防止法','z'],
  ['6','6_3','不動産需給統計','z'],
  ['6','6_4','土地の形質','z'],
  ['6','6_5','建物の形質','z'],
];

// 無料年度範囲：平成23年〜令和7年
const FREE_YEARS = ['25','24','23','22','21-2','21-1','20-2','20-1','19','18','17','16','15','14','13','12','11'];

function extractQuestionsFromHTML(html, catName, area) {
  const questions = [];
  
  // 問題ブロックを抽出（class="question" のdiv）
  const blocks = html.split(/<div[^>]*class="question"[^>]*>/);
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    
    // 問題文抽出: <p class="q_text"> または <div class="q_text">
    let qText = '';
    const qMatch = block.match(/<p[^>]*class="[^"]*q_text[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    if (qMatch) qText = qMatch[1].replace(/<[^>]+>/g, '').trim();
    
    if (!qText) continue;
    
    // 選択肢抽出: <li class="answer"> または <label>内のテキスト
    const options = [];
    const optMatches = block.matchAll(/<label[^>]*>[\s\S]*?<\/label>/g);
    for (const m of optMatches) {
      // inputタグを除去
      let optText = m[0].replace(/<input[^>]+>/g, '').replace(/<[^>]+>/g, '').trim();
      if (optText) options.push(optText);
    }
    
    // 別のパターン: <li> でラップされた選択肢
    if (options.length === 0) {
      const liMatches = block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g);
      for (const m of liMatches) {
        let optText = m[1].replace(/<[^>]+>/g, '').trim();
        if (optText && optText.length > 1) options.push(optText);
      }
    }
    
    // 正解インデックス抽出: class="correctAnswer" または data-answer
    let correctIdx = 0;
    const correctMatch = block.match(/class="[^"]*correct[^"]*"/);
    if (correctMatch) {
      // correctクラスが付いた要素のインデックスを見つける
      const labels = block.match(/<label/g);
      if (labels) {
        for (let j = 0; j < labels.length; j++) {
          const labelEnd = block.indexOf('</label>', block.indexOf('<label', j === 0 ? 0 : block.indexOf('<label', j > 0 ? block.indexOf('<label') + 1 : 0)));
          if (labelEnd === -1) break;
          const labelContent = block.substring(block.indexOf('<label', j === 0 ? 0 : block.indexOf('<label', j > 0 ? block.indexOf('<label') + 1 : 0)), labelEnd);
          if (labelContent.includes('correct')) {
            correctIdx = j;
            break;
          }
        }
      }
    }
    
    // 最低限のバリデーション
    if (options.length >= 2 && qText.length > 5) {
      questions.push({
        area: area,
        tag: catName,
        q: qText,
        a: options.slice(0, 4), // 最大4択
        c: correctIdx,
        year: extractYear(block)
      });
    }
  }
  
  return questions;
}

function extractYear(block) {
  const yearMatch = block.match(/平成(\d+)年|令和(\d+)年/);
  if (yearMatch) {
    if (yearMatch[1]) return 'H' + yearMatch[1];
    if (yearMatch[2]) return 'R' + yearMatch[2];
  }
  return 'unknown';
}

async function scrapeCategory(browser, field, cat, catName, area) {
  const page = await browser.newPage();
  
  try {
    // セッションを維持するため最初にトップページ
    await page.goto('https://takken-siken.com/kakomon.php', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // フォームにチェックを入れて送信
    await page.evaluate((field, cat, years) => {
      // 全年度のチェックを外す
      document.querySelectorAll('[name="times[]"]').forEach(el => el.checked = false);
      // 無料年度だけチェック
      years.forEach(y => {
        const el = document.querySelector(`[name="times[]"][value="${y}"]`);
        if (el) el.checked = true;
      });
      // 分野チェック
      document.querySelectorAll('[name="fields[]"]').forEach(el => el.checked = false);
      const fieldEl = document.querySelector(`[name="fields[]"][value="${field}"]`);
      if (fieldEl) fieldEl.checked = true;
      // カテゴリチェック（全カテゴリ外してから指定）
      document.querySelectorAll('[name="categories[]"]').forEach(el => el.checked = false);
      const catEl = document.querySelector(`[name="categories[]"][value="${cat}"]`);
      if (catEl) catEl.checked = true;
      // レベル全部
      document.querySelectorAll('[name="level[]"]').forEach(el => el.checked = true);
    }, field, cat, FREE_YEARS);
    
    // フォーム送信
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.click('.sendConfigform')
    ]);
    
    // 問題ページが表示されるのを待つ
    await page.waitForTimeout(2000);
    
    // HTML取得
    const html = await page.content();
    
    // 問題抽出
    const questions = extractQuestionsFromHTML(html, catName, area);
    
    console.log(`${catName}: ${questions.length}問`);
    await page.close();
    return questions;
    
  } catch (e) {
    console.log(`${catName}: エラー - ${e.message}`);
    await page.close();
    return [];
  }
}

async function main() {
  console.log('Puppeteerで宅建過去問道場をスクレイピング開始...');
  console.log(`対象: ${FREE_YEARS.length}年分, ${CATEGORIES.length}カテゴリ\n`);
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let allQuestions = [];
  
  for (const [field, cat, catName, area] of CATEGORIES) {
    const questions = await scrapeCategory(browser, field, cat, catName, area);
    allQuestions = allQuestions.concat(questions);
  }
  
  await browser.close();
  
  console.log(`\n合計: ${allQuestions.length}問取得`);
  
  // JSONに保存
  fs.writeFileSync('questions_raw.json', JSON.stringify(allQuestions, null, 2), 'utf-8');
  console.log('questions_raw.json に保存しました');
}

main().catch(console.error);