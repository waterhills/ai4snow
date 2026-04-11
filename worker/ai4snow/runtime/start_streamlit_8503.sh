#!/bin/bash
cd "/Users/murphy/Library/Mobile Documents/com~apple~CloudDocs/Projects/滑雪项目/Ski_Avatar_Pro"
exec /Users/murphy/miniconda3/envs/ski_avatar/bin/python -m streamlit run ./webface/app.py --server.headless true --server.port 8503 >> runtime/streamlit_8503.log 2>&1
