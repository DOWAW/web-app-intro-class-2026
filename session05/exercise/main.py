"""
第5回 実習: Python & FastAPI入門

このファイルを編集して、以下のエンドポイントを完成させてください:
  1. GET /            - Hello World（実装済み）
  2. GET /hello/{name} - 名前付き挨拶
  3. GET /todos       - TODOリスト取得

起動方法:
  python main.py
"""

import uvicorn
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"message": "TODO API is running", "docs": "/docs"}


@app.get("/hello/{name}")
def hello(name: str):
    return {"message": f"こんにちは、{name}さん！"}


todos = [
    {"id": 1, "title": "レポートを書く", "done": False},
    {"id": 2, "title": "買い物に行く", "done": True},
    {"id": 3, "title": "自分のTODOを追加", "done": False},
]


@app.get("/todos")
def get_todos():
    return todos


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)