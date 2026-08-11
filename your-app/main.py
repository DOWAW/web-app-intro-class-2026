"""
ゲーム進捗メモ バックエンド
第9回: オリジナルアプリ制作（TODOアプリを改造）

TODOアプリからの変換表:
    todos -> games / done -> done(意味を変更) / todo.db -> games.db / /todos -> /games
Level 2 で追加したカラム:
    hardware … ハード名
    kind     … 枠の種類（clear=クリアを目指すゲーム / daily=毎日やるゲーム）
"""

import sqlite3  # Python標準のデータベース（SQLite）を使うためのライブラリ
import uvicorn  # FastAPIアプリを動かすためのWebサーバー

from fastapi import FastAPI, HTTPException  # Webアプリ本体とエラー応答用
from fastapi.middleware.cors import CORSMiddleware  # ブラウザからのアクセスを許可する設定
from fastapi.staticfiles import StaticFiles  # HTML/CSS/JSなどのファイルを配信する機能
from pydantic import BaseModel, Field  # 受け取るデータの形をチェックする道具

# --- FastAPIアプリ ---
# このappが、Webアプリ全体の本体になる
app = FastAPI(title="ゲーム進捗メモ")

# CORS設定: 別のアドレスで動くフロント（ブラウザの画面）からの通信を許可する
# allow_origins=["*"] は「どこからのアクセスでもOK」という意味（学習用の設定）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- データベース設定 ---
# データを保存するファイルの名前。アプリと同じフォルダに games.db が作られる
# ※テーブル名やカラムを変えたら、古いDBファイルは消してから起動し直すこと。
#   CREATE TABLE IF NOT EXISTS は「無ければ作る」なので、古いDBが残っていると
#   新しいテーブルが作られない（第6回）。
DATABASE = "games.db"

# kind カラムに入れてよい値。ここに無い値が送られてきたら 400 で断る。
# clear = クリアを目指すゲーム / daily = 毎日やるゲーム（ソシャゲなど）
ALLOWED_KINDS = ("clear", "daily")


def init_db():
    """データベースとテーブルを初期化する"""
    conn = sqlite3.connect(DATABASE)  # データベースに接続する
    cursor = conn.cursor()  # SQLを実行する係（カーソル）を用意する
    # games テーブルがまだ無ければ作る（IF NOT EXISTS）
    #   id       : 自動で増える番号（主キー）
    #   title    : ゲーム名（空はNG）
    #   hardware : ハード名（Level 2 で追加）
    #   kind     : 枠の種類 clear / daily（Level 2 で追加）
    #   done     : 済みかどうか（0=まだ, 1=済み）
    #              clear枠なら「クリアした」、daily枠なら「今日やった」の意味になる
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            hardware TEXT NOT NULL,
            kind TEXT NOT NULL,
            done INTEGER DEFAULT 0
        )
    """)

    # 中身がまだ1件も無いときだけ、見本のデータを入れておく。
    # （毎回入れると起動のたびに増えてしまうので、件数を数えてから判断する）
    cursor.execute("SELECT COUNT(*) FROM games")
    if cursor.fetchone()[0] == 0:
        cursor.executemany(
            "INSERT INTO games (title, hardware, kind, done) VALUES (?, ?, ?, 0)",
            [
                ("崩壊：スターレイル", "スマホ", "daily"),
                ("スプラトゥーンレイダース", "Switch2", "daily"),
                ("ゼルダの伝説 ティアーズ オブ ザ キングダム", "Switch", "clear"),
                ("メトロイドプライム4", "Switch2", "clear"),
            ],
        )

    conn.commit()  # 変更を確定して保存する
    conn.close()  # 接続を閉じる


# --- Pydanticモデル ---
# APIが受け取るデータの「形」を決めるクラス。
# 形に合わないデータが送られてきたら、FastAPIが自動でエラーを返してくれる。
# これがバリデーション（第8回のセキュリティ対策③）にあたる。


class GameCreate(BaseModel):
    # 新しいゲームを登録するときに受け取るデータ
    # title は1文字以上100文字以下の文字列でなければならない
    title: str = Field(min_length=1, max_length=100)
    # hardware も同じくチェックする（Level 2 で足したカラムにも制約を付ける）
    hardware: str = Field(min_length=1, max_length=30)
    # kind は clear / daily のどちらか。長さの上限もここで決めておく
    kind: str = Field(min_length=1, max_length=10)


class GameUpdate(BaseModel):
    # ゲームを更新するときに受け取るデータ
    # done は True / False（済みかどうか）
    done: bool


def row_to_dict(row):
    """SQLiteの1行(タプル)を、ブラウザに返しやすい辞書に作り変える"""
    # row は (id, title, hardware, kind, done) の順で入っている
    return {
        "id": row[0],
        "title": row[1],
        "hardware": row[2],
        "kind": row[3],
        "done": bool(row[4]),
    }


# --- APIエンドポイント ---
# @app.get / @app.post などの飾り（デコレータ）で、
# 「どのURLに、どの種類のリクエストが来たら、この関数を動かすか」を決める。


@app.get("/games")  # GET /games にアクセスされたら実行
def get_games(sort: str = "id"):
    """ゲーム一覧を取得する

    sort は並び順の指定。/games?sort=title のようにURLの後ろに付けて送られてくる。
    指定が無いときは "id"（登録した順）になる。
    """
    # 並び順に使ってよい値と、それに対応するSQLの対応表。
    # ※ ここで ? のパラメータバインディングが使えない点に注意。
    #   ? が使えるのは「値」だけで、カラム名や ORDER BY には使えない。
    #   だから受け取った文字列をSQLにそのまま繋ぐと、SQLインジェクションになる。
    #   対策として「あらかじめ用意した文からしか選べない」形にしている。
    sort_options = {
        "id": "ORDER BY id",  # 登録した順
        "title": "ORDER BY title",  # ゲーム名の順
        "done": "ORDER BY done, id",  # まだの物を上に持ってくる
    }
    # 知らない値が送られてきたら、黙って既定の "id" として扱う
    order_by = sort_options.get(sort, sort_options["id"])

    conn = sqlite3.connect(DATABASE)  # 接続する
    cursor = conn.cursor()

    # games テーブルの全データを、指定された並び順で取り出す
    cursor.execute(f"SELECT id, title, hardware, kind, done FROM games {order_by}")
    games = cursor.fetchall()  # 取り出した全行をリストで受け取る

    conn.close()  # 接続を閉じる
    return [row_to_dict(game) for game in games]


@app.post("/games", status_code=201)  # POST /games で新規作成（201=作成成功）
def create_game(game: GameCreate):
    """新しいゲームを登録する"""
    # kind が決められた値かどうかを確かめる。
    # 長さ（Field）だけでは「clear か daily か」までは見られないので、ここで確認する。
    if game.kind not in ALLOWED_KINDS:
        # 400 = リクエストの内容がおかしい、という意味のエラー
        raise HTTPException(status_code=400, detail="枠の種類が正しくありません")

    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    # 新しいゲームを1件追加する（done は 0=まだ で登録）
    # ? を使うことで、危険な文字列が混ざってもSQLが壊れない（SQLインジェクション対策）
    cursor.execute(
        "INSERT INTO games (title, hardware, kind, done) VALUES (?, ?, ?, 0)",
        (game.title, game.hardware, game.kind),
    )
    conn.commit()  # 追加を確定する
    game_id = cursor.lastrowid  # たった今追加した行の id を取得する

    conn.close()
    return {
        "id": game_id,
        "title": game.title,
        "hardware": game.hardware,
        "kind": game.kind,
        "done": False,
    }


# PUT /games/5 のように、URLの {game_id} の部分が引数 game_id に入る
@app.put("/games/{game_id}")
def update_game(game_id: int, game: GameUpdate):
    """ゲームの「済み」状態を更新する"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    # まず、その id のゲームが本当にあるか確認する
    cursor.execute(
        "SELECT id, title, hardware, kind, done FROM games WHERE id = ?", (game_id,)
    )
    existing = cursor.fetchone()  # 1件だけ取り出す。無ければ None が返る
    if existing is None:
        conn.close()  # 見つからないときも接続は閉じてから終わる
        # 404エラー（見つからない）を返して処理を中断する
        raise HTTPException(status_code=404, detail="ゲームが見つかりません")

    # done を更新する。True/False は int() で 1/0 に変換して保存
    cursor.execute(
        "UPDATE games SET done = ? WHERE id = ?",
        (int(game.done), game_id),
    )
    conn.commit()  # 更新を確定する

    conn.close()
    # 取り出しておいた行の done だけ、今回更新した値に差し替えて返す
    updated = row_to_dict(existing)
    updated["done"] = game.done
    return updated


# デイリー枠だけをまとめて「まだ」に戻す。
# URLが /games/{game_id} と形が違う（3つに区切られている）ので、ぶつからない。
@app.put("/games/daily/reset")
def reset_daily():
    """デイリー枠のチェックをまとめて外す（日付が変わったとき用）"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    # kind が daily の行だけ done を 0 に戻す。1件ずつ更新しなくていい
    cursor.execute("UPDATE games SET done = 0 WHERE kind = ?", ("daily",))
    conn.commit()
    # cursor.rowcount = さっきのSQLで実際に変更された行数
    count = cursor.rowcount

    conn.close()
    return {"message": "デイリーをリセットしました", "count": count}


@app.delete("/games/{game_id}")  # DELETE /games/5 で id=5 のゲームを削除
def delete_game(game_id: int):
    """ゲームを削除する"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()

    # 削除する前に、その id のゲームが存在するか確認する
    cursor.execute("SELECT id FROM games WHERE id = ?", (game_id,))
    existing = cursor.fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail="ゲームが見つかりません")

    cursor.execute("DELETE FROM games WHERE id = ?", (game_id,))  # 削除する
    conn.commit()  # 削除を確定する

    conn.close()
    return {"message": "ゲームを削除しました", "id": game_id}


# --- 静的ファイル配信 ---
# static フォルダの中身（index.html など）をそのままブラウザに表示できるようにする
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# --- アプリ起動時にDBを初期化 ---
# プログラムが読み込まれたタイミングで、テーブルが無ければ作っておく
init_db()

# このファイルを直接 `python main.py` で実行したときだけ、サーバーを起動する
if __name__ == "__main__":
    # host="0.0.0.0" で外部からのアクセスも受け付ける。ポート8000で待ち受ける
    # （Codespaceで動かすときは 0.0.0.0 でないとポート転送で開けない）
    uvicorn.run(app, host="0.0.0.0", port=8000)