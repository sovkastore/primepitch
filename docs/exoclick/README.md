# ExoClick Ad Network — Integration & Configuration

## 1. Account Details
- **Network Name:** ExoClick (Publisher)
- **Username:** `Julian0040`
- **Dashboard URL:** `https://admin.exoclick.com/panel/publisher/dashboard`
- **Sites & Zones URL:** `https://admin.exoclick.com/panel/publisher/sites-and-zones/sites`
- **Site ID:** `1107870`

---

## 2. Site Ownership Verification
- **Verified Domain:** `primepitch.cc` / `primepitch.live`
- **Verification Token:** `e78e5330cb1b40ab78fefd9c9a855c40`
- **Verification File:** `public/e78e5330cb1b40ab78fefd9c9a855c40.html`
- **Verification Meta Tag:**
  ```html
  <meta name="exoclick-site-verification" content="e78e5330cb1b40ab78fefd9c9a855c40" />
  ```
- **Live File URL:** `https://primepitch.cc/e78e5330cb1b40ab78fefd9c9a855c40.html`

---

## 3. Active Zones

### Zone 1: Match Player Video Pre-Roll (In-Stream VAST)
- **Zone Name:** `PrimePitch Pre-Roll - (In Stream)`
- **Zone ID:** `5997530`
- **Format:** `In-Stream Video (VAST 3.0)`
- **Category:** `Entertainment & Lifestyle` → `Streaming`
- **Frequency:** `Always`
- **Skip Timer:** `Enabled with time Delay (5 seconds)`
- **VAST URL:**
  ```text
  https://s.magsrv.com/v1/vast.php?idz=5997530
  ```
- **Client Hints Meta Tag (`Delegate-CH`):**
  ```html
  <meta http-equiv="Delegate-CH" content="Sec-CH-UA https://s.magsrv.com; Sec-CH-UA-Mobile https://s.magsrv.com; Sec-CH-UA-Arch https://s.magsrv.com; Sec-CH-UA-Model https://s.magsrv.com; Sec-CH-UA-Platform https://s.magsrv.com; Sec-CH-UA-Platform-Version https://s.magsrv.com; Sec-CH-UA-Bitness https://s.magsrv.com; Sec-CH-UA-Full-Version-List https://s.magsrv.com; Sec-CH-UA-Full-Version https://s.magsrv.com;" />
  ```

---

## 4. Payout Terms
- **Minimum Withdrawal:** $20 (Crypto USDC / ERC20, Paxum).
- **Payout Frequency:** Weekly (Net-7) or Monthly.
