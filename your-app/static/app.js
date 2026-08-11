/**
 * ゲーム進捗メモ JavaScript
 * 第9回: オリジナルアプリ制作（TODOアプリを改造）
 *
 * 【このファイルの役割】
 *  ブラウザの画面（HTML）と、バックエンド（main.py）の橋渡しをする。
 *
 * 【全体の流れ】
 *  1. ページが開かれる → loadGames() でサーバーからゲーム一覧を取得
 *  2. renderGames() が、取得したデータを画面のリストとして描画する
 *  3. ユーザーが「追加・チェック・削除・絞り込み」を操作する
 *     → 対応する関数がサーバーに変更を送る（fetch）
 *     → 最後にもう一度 loadGames() して、最新の状態を画面に反映する
 *
 * ※ fetch はサーバーと通信する命令。通信は時間がかかるので、
 *   async / await を使って「結果が返ってくるまで待つ」書き方をしている。
 */

// サーバー側のAPIのアドレス（main.py の @app.get("/games") などに対応）
const API_URL = "/games";

// 最後にサーバーから取得した一覧を覚えておく変数。
// 絞り込みボタンを押したときに、サーバーへ取り直さず画面だけ描き替えるために使う。
let allGames = [];

// いま選ばれている絞り込みの種類（"all" / "clear" / "daily"）
let currentFilter = "all";

// いま選ばれている並び順（"id" / "done" / "title"）。サーバーに送って並べ替えてもらう
let currentSort = "id";

// ============================================================
// ゲーム操作（CRUD）
// ============================================================

/**
 * ゲーム一覧を取得して表示する
 */
async function loadGames() {
  // try ... catch: 通信中にエラーが起きても、アプリが止まらないようにする
  try {
    // サーバーに「一覧をください」とお願いし、返事(response)を待つ。
    // ?sort=... を付けると、サーバーがSQLの ORDER BY を変えて並べ替えてくれる。
    const response = await fetch(`${API_URL}?sort=${currentSort}`);

    // response.ok が false = サーバーがエラーを返したとき
    if (!response.ok) {
      const error = await response.json(); // エラー内容を取り出す
      showError(error.detail || "ゲーム一覧の取得に失敗しました");
      return; // ここで処理を終える
    }

    // 返ってきたデータ(JSON)をJavaScriptの配列に変換する
    allGames = await response.json();
    renderGames(); // 画面に描画する
  } catch (error) {
    // そもそもサーバーにつながらなかったときなど
    showError("通信エラーが発生しました");
  }
}

/**
 * 新しいゲームを追加する
 */
async function addGame() {
  // 入力欄の要素を取得し、入力された文字を読み取る（trimで前後の空白を除去）
  const input = document.getElementById("game-input");
  const hardwareInput = document.getElementById("hardware-input");
  const kindInput = document.getElementById("kind-input");
  const title = input.value.trim();
  const hardware = hardwareInput.value.trim();
  const kind = kindInput.value; // プルダウンで選ばれている値（clear か daily）

  // 送信前のチェック（バリデーション）: 空のときは送らずに注意を表示
  if (title === "") {
    showError("ゲーム名を入力してください");
    return;
  }

  // Level 2 で足した hardware も同じようにチェックする
  if (hardware === "") {
    showError("ハード名を入力してください");
    return;
  }

  // 長すぎるときも送らない（サーバー側でも100文字までチェックしている）
  if (title.length > 100) {
    showError("ゲーム名は100文字以内で入力してください");
    return;
  }

  if (hardware.length > 30) {
    showError("ハード名は30文字以内で入力してください");
    return;
  }

  try {
    // サーバーに「このゲームを追加して」と送る
    const response = await fetch(API_URL, {
      method: "POST", // POST = 新しいデータを作る
      headers: { "Content-Type": "application/json" }, // 中身はJSON形式だと伝える
      // データをJSON文字列にして送る。カラムを足したのでキーも3つになっている
      body: JSON.stringify({ title: title, hardware: hardware, kind: kind }),
    });

    if (!response.ok) {
      const error = await response.json();
      showError(error.detail || "ゲームの追加に失敗しました");
      return;
    }

    input.value = ""; // 入力欄を空に戻す
    hardwareInput.value = "";
    await loadGames(); // 一覧を取り直して、追加結果を画面に反映する
  } catch (error) {
    showError("通信エラーが発生しました");
  }
}

/**
 * ゲームの「済み」状態を切り替える
 * id: 対象のゲームの番号 / currentDone: いまの状態(true/false)
 */
async function toggleGame(id, currentDone) {
  try {
    // `${API_URL}/${id}` で /games/5 のようなアドレスを作る（id=5のゲームが対象）
    const response = await fetch(`${API_URL}/${id}`, {
      method: "PUT", // PUT = 既存のデータを更新する
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !currentDone }), // !で状態を反転させる
    });

    if (!response.ok) {
      const error = await response.json();
      showError(error.detail || "ゲームの更新に失敗しました");
      return;
    }

    await loadGames(); // 一覧を取り直して、更新結果を画面に反映する
  } catch (error) {
    showError("通信エラーが発生しました");
  }
}

/**
 * ゲームを削除する
 * id: 削除したいゲームの番号
 */
async function deleteGame(id) {
  try {
    // /games/5 のようなアドレスに対して削除を依頼する
    const response = await fetch(`${API_URL}/${id}`, {
      method: "DELETE", // DELETE = データを削除する
    });

    if (!response.ok) {
      const error = await response.json();
      showError(error.detail || "ゲームの削除に失敗しました");
      return;
    }

    await loadGames(); // 一覧を取り直して、削除結果を画面に反映する
  } catch (error) {
    showError("通信エラーが発生しました");
  }
}

/**
 * デイリー枠のチェックをまとめて外す
 * 1件ずつPUTするのではなく、専用のエンドポイントを1回呼ぶだけで済ませている
 */
async function resetDaily() {
  try {
    const response = await fetch(`${API_URL}/daily/reset`, {
      method: "PUT", // PUT = 既存のデータを更新する
    });

    if (!response.ok) {
      const error = await response.json();
      showError(error.detail || "リセットに失敗しました");
      return;
    }

    await loadGames(); // 一覧を取り直して、結果を画面に反映する
  } catch (error) {
    showError("通信エラーが発生しました");
  }
}

// ============================================================
// 描画
// ============================================================

/**
 * ゲームリストを描画する（XSS対策: createElement + textContent）
 *
 * allGames（サーバーから取得した全件）を、currentFilter に従って絞り込んでから並べる。
 *
 * 【XSS対策のポイント】
 *  innerHTML に文字列を直接入れると、入力に紛れ込んだ<script>などが
 *  実行されてしまう危険がある（XSS）。そこで textContent を使い、
 *  入力を「ただの文字」として扱うことで、この攻撃を防いでいる。
 */
function renderGames() {
  const list = document.getElementById("game-list");
  list.innerHTML = ""; // 古い表示を一度すべて消してから描き直す

  // --- Level 3 その1: 絞り込み ---
  // filter() は「条件に合うものだけを残した新しい配列」を作る命令（第4回）。
  // サーバーには行かず、手元の配列を絞るだけなのでJSだけで完結する。
  const shownGames = allGames.filter((game) => {
    if (currentFilter === "all") return true; // すべて
    return game.kind === currentFilter; // clear か daily で絞る
  });

  // --- Level 3 その2: 件数表示 ---
  // 配列の length（要素の数）を数えて画面に出すだけ。これもJSだけで完結する。
  const clearGames = allGames.filter((game) => game.kind === "clear");
  const dailyGames = allGames.filter((game) => game.kind === "daily");
  const notCleared = clearGames.filter((game) => !game.done).length;
  const doneToday = dailyGames.filter((game) => game.done).length;

  const countText = document.getElementById("count-text");
  countText.textContent =
    `プレイ中 ${clearGames.length} 本（未クリア ${notCleared} 本）　　` +
    `デイリー ${dailyGames.length} 本（今日やった ${doneToday} 本）`;

  // 表示するものが1件も無いときの案内
  if (shownGames.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-text";
    empty.textContent = "ここに表示するゲームはありません";
    list.appendChild(empty);
    return;
  }

  // shownGames配列の1件ずつ(game)について、リストの行を作る
  shownGames.forEach((game) => {
    // <li> 済みなら "done" クラスを足して見た目を変える
    const li = document.createElement("li");
    li.className = "game-item" + (game.done ? " done" : "");

    // チェックボックスと文字をまとめる<label>
    const label = document.createElement("label");
    label.className = "game-label";

    // チェックボックス。意味は枠によって変わる
    //   clear枠 → クリアした / daily枠 → 今日やった
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "game-checkbox";
    checkbox.checked = game.done; // いまの状態をチェックに反映
    checkbox.title = game.kind === "daily" ? "今日やった" : "クリアした";
    // チェックが変わったら、状態を切り替える関数を呼ぶ
    checkbox.addEventListener("change", () => toggleGame(game.id, game.done));

    // ゲーム名と、その下の補足（枠バッジ＋ハード名）をまとめる箱
    const textBox = document.createElement("div");
    textBox.className = "game-text";

    // ゲーム名。textContent で安全に入れる（XSS対策）
    const titleSpan = document.createElement("span");
    titleSpan.className = "game-title";
    titleSpan.textContent = game.title;

    // 補足を横に並べる行
    const metaBox = document.createElement("div");
    metaBox.className = "game-meta";

    // 枠のバッジ（クリア / 毎日）
    const kindBadge = document.createElement("span");
    kindBadge.className = "kind-badge kind-" + game.kind;
    kindBadge.textContent = game.kind === "daily" ? "デイリー" : "プレイ中";

    // ハード名（Level 2 で足したカラム）。こちらも textContent で入れる
    const hardwareSpan = document.createElement("span");
    hardwareSpan.className = "game-hardware";
    hardwareSpan.textContent = game.hardware;

    metaBox.appendChild(kindBadge);
    metaBox.appendChild(hardwareSpan);

    textBox.appendChild(titleSpan);
    textBox.appendChild(metaBox);

    // label の中に [チェックボックス][ゲーム名+補足] を入れる
    label.appendChild(checkbox);
    label.appendChild(textBox);

    // 削除ボタン。押されたら削除する関数を呼ぶ
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-button";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => deleteGame(game.id));

    // <li> の中に [label][削除ボタン] を入れて、リストに追加する
    li.appendChild(label);
    li.appendChild(deleteBtn);

    list.appendChild(li);
  });
}

// ============================================================
// メッセージ表示
// ============================================================

// エラーメッセージを画面に表示する（5秒後に自動で消える）
function showError(message) {
  const errorDiv = document.getElementById("error-message");
  errorDiv.textContent = message; // メッセージを表示
  errorDiv.style.display = "block"; // 見えるようにする
  // setTimeout: 指定したミリ秒後に処理を実行する。5000ミリ秒 = 5秒
  setTimeout(() => {
    errorDiv.style.display = "none"; // 5秒後に隠す
  }, 5000);
}

// ============================================================
// イベントリスナー
// ============================================================

// フォームが送信された（追加ボタン or Enter）ときの動き
document.getElementById("game-form").addEventListener("submit", function (e) {
  e.preventDefault(); // ページが再読み込みされる標準動作を止める
  addGame(); // 自分で用意した追加処理を呼ぶ
});

// 絞り込みボタン（3つ）それぞれにクリックの動きを登録する
document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    // 押されたボタンの data-filter の値を、いまの絞り込み条件にする
    currentFilter = button.dataset.filter;

    // 見た目の切り替え: 全部から active を外し、押されたものだけに付ける
    document.querySelectorAll(".filter-button").forEach((b) => {
      b.classList.remove("active");
    });
    button.classList.add("active");

    // サーバーには行かず、手元のデータを描き直すだけ
    renderGames();
  });
});

// 並び替えのプルダウンが変わったときの動き
document.getElementById("sort-input").addEventListener("change", function () {
  currentSort = this.value; // this = 操作された<select>。value が選ばれた値
  loadGames(); // 並び順はサーバー側で決めるので、取り直す必要がある
});

// 「デイリーをリセット」ボタンが押されたときの動き
document.getElementById("reset-button").addEventListener("click", function () {
  // confirm: OK/キャンセルを聞くウィンドウ。うっかり押した時の取り消し用
  if (confirm("デイリーのチェックをすべて外しますか？")) {
    resetDaily();
  }
});

// ページ読み込み時に、まずゲーム一覧を取得して表示する（ここがスタート地点）
loadGames();