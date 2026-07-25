const fs = require("fs");

const FLOOR_MAP = {
  "restricted-capacity":0,"intention":1,"agency":2,"prescription":3,"real-rights":4,
  "possession":5,"servitudes":6,"mortgage":7,"security-interests":8,"obligations":9,
  "contract-general":10,"contract-specifics":11,"torts":12,"family-succession":13,"lease-act":14,
  "urban-planning":15,"building-standards1":16,"building-standards2":17,"national-land-use":18,
  "farmland":19,"land-development":20,"other-regulations":21,"rea-license":22,"rea-disclosure":23,
  "rea-advertising":24,"rea-association":25,"rea-penalty":26,"appraisal":27,"registration":28,
  "housing-finance":29,"property-tax":31,"stamp-tax":32,"statistics":33,
};

const BTN = '<div style="display:flex;justify-content:center;margin:32px 0"><a href="battle.html#floorFLOOR" style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;border-radius:12px;background:linear-gradient(135deg,#d4a853,#f0d68a);color:#1a1220;font-weight:800;font-size:15px;text-decoration:none;transition:.2s;box-shadow:0 2px 12px rgba(212,168,83,.3);font-family:sans-serif">\u2694 \u3053\u306e\u5206\u91ce\u3092\u30d0\u30c8\u30eb\u3067\u6311\u6226</a></div>';

let count = 0;
fs.readdirSync("content").filter(f=>f.endsWith(".html")).forEach(f => {
  const key = f.replace("column-","").replace(".html","");
  const floor = FLOOR_MAP[key];
  if (floor === undefined) return;
  
  const path = "content/" + f;
  let html = fs.readFileSync(path, "utf8");
  
  // 既にボタンがあるかチェック
  if (html.includes("battle.html#floor")) return;
  
  // 最後の</body>の前に挿入
  const btn = BTN.replace("FLOOR", floor.toString());
  html = html.replace("</body>", btn + "\n</body>");
  fs.writeFileSync(path, html);
  count++;
  console.log("floor" + floor + " -> " + f);
});

console.log("\n" + count + " articles updated");
