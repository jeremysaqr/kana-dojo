# Robustness repros (persona bug hunt, rounds 3–4)

Run from this folder; each uses ports 4196–4199 and DevTools port 9346, and its own data under
`../robust-runs/` (never the real `data/`).

- `node ob2.mjs <mode> N`: outbox double-count / loss cases. Modes: `natural-lan` (120 ms latency,
  leave 200–450 ms after answering), `inflight` (a save's reply held), `lostreply` (server killed after
  writing), `stale` (entry left while another tab saves 22 times), `bfcache-otherload`. Expect
  `lost 0, over 0` in the SUMMARY line.
- `node ob1.mjs <mode> N`: leave right after answering (server up / down / another tab's save in
  between / localStorage blocked). `blocked-between` loses answers by design (no storage, no time to
  merge); everything else should report 0 lost, 0 over.
- `node twoinst4.mjs` and `node twoinst4b.mjs`: two servers on one data folder (port clash, simultaneous
  starts, stale locks). Expect "both serving in 0".
