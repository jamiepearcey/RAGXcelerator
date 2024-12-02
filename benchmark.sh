#!/bin/bash

curl -X POST http://localhost:3000/benchmark/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How are different companies approaching AI technology development?",
    "mode": "naive",
    "iterations": 5
  }'

curl -X POST http://localhost:3000/benchmark/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How are different companies approaching AI technology development?",
    "mode": "local"
  }'

curl -X POST http://localhost:3000/benchmark/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How are different companies approaching AI technology development?",
    "mode": "global"
  }'

# Multiple iterations for statistical analysis
curl -X POST http://localhost:3000/benchmark/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How are different companies approaching AI technology development?",
    "mode": "hybrid",
    "iterations": 5
  }'
