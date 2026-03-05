{\rtf1\ansi\ansicpg1252\cocoartf2867
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # CineBoard \'97 Handoff (Mar 2026)\
\
## Workflow \'93a prova di bomba\'94 (NON SI DEROGA)\
- Never work on main\
- Branch-first, record branch name\
- After tests: commit/push, merge --no-ff, get main SHA\
- After SHA: create/push backup branch `backup/main-<milestone>-<SHA>` + annotated tag `v2.3-<milestone>`\
- Never change snapshot shape; no destructive normalizers; `emitNodesChange` is the sole persistence trigger; `parentId` + `childOrder` source of truth.\
\
## Repo anchor (run before any work)\
Commands:\
- git checkout main\
- git pull\
- git rev-parse HEAD\
- git status\
- git branch --show-current\
- git branch -vv | head -n 80\
- git branch -r | head -n 120\
\
## Certified milestone\
- main SHA: e5130cd8e5918ab9b9b845ee8a9bdc12528578a5\
- backup: backup/main-shot-fv-output-delete-clean-e5130cd8e5918ab9b9b845ee8a9bdc12528578a5\
- tag: v2.3-shot-fv-output-delete-clean\
\
## Supabase\
- gmvolqboskluevinrjce.supabase.co\
\
## Canon decisions\
- PLP includes Entities only via incoming edges Entity\uc0\u8594 Prompt (no inference).\
- Reflection-only exports (no dedupe / no bucketing / no hidden logic).\
- EntityRef not contained by columns (linkable only).\
\
## Roadmap next\
- PLP download all take media\
- Column download even if no media\
- Entities \uc0\u8594  Prompt inclusion UX feedback + docs}