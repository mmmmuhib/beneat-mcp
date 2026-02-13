#!/usr/bin/env bash
#
# Beneat Risk MCP — curl cheatsheet
#
# Start the server first:  npm run start:http
# Default port: 3001
#

BASE="http://localhost:3001"
WALLET="YOUR_WALLET_ADDRESS"

# ── Server ────────────────────────────────────────────

# Health check
curl "$BASE/health"

# Tool manifest (OpenAI-compatible JSON Schema)
curl "$BASE/api/tools"

# ── Observation tools ─────────────────────────────────

# Vault status
curl -X POST "$BASE/api/tools/beneat_get_status" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# Trader profile
curl -X POST "$BASE/api/tools/beneat_get_profile" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# Verify agent (trust score + grade)
curl -X POST "$BASE/api/tools/beneat_verify_agent" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# Portfolio health (Drift positions)
curl -X POST "$BASE/api/tools/beneat_health_check" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# Diagnose stuck swap
curl -X POST "$BASE/api/tools/beneat_cancel_swap" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# Leaderboard (top 10 by rating)
curl -X POST "$BASE/api/tools/beneat_get_leaderboard" \
  -H "Content-Type: application/json" \
  -d "{\"limit\":10,\"sort_by\":\"rating\"}"

# Register agent
curl -X POST "$BASE/api/tools/beneat_register_agent" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# ── Risk enforcement ──────────────────────────────────

# Pre-flight trade check
curl -X POST "$BASE/api/tools/beneat_check_trade" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"market\":\"SOL-PERP\",\"size\":0.1,\"direction\":\"long\"}"

# Record trade P&L
curl -X POST "$BASE/api/tools/beneat_record_trade" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"pnl\":-0.01,\"market\":\"SOL-PERP\",\"confidence\":0.7}"

# AgentWallet policy status
curl -X POST "$BASE/api/tools/beneat_set_policy" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"action\":\"status\"}"

# ── Calibration ───────────────────────────────────────

# Calibrate risk rules
curl -X POST "$BASE/api/tools/beneat_calibrate" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"deposit_amount\":1,\"strategy_type\":\"day_trading\",\"risk_tolerance\":\"medium\"}"

# Recalibrate with latest history
curl -X POST "$BASE/api/tools/beneat_recalibrate" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\"}"

# ── Agent improvement ─────────────────────────────────

# Behavioral analytics + directives
curl -X POST "$BASE/api/tools/beneat_get_analytics" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"lookback_days\":30}"

# Playbook (advisory)
curl -X POST "$BASE/api/tools/beneat_get_playbook" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"lookback_days\":30}"

# Confidence calibration
curl -X POST "$BASE/api/tools/beneat_calibrate_confidence" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"confidence\":0.8}"

# Session strategy
curl -X POST "$BASE/api/tools/beneat_get_session_strategy" \
  -H "Content-Type: application/json" \
  -d "{\"wallet_address\":\"$WALLET\",\"lookback_days\":30}"
