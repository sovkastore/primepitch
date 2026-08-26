# Kadam — Popunder block (wiki.kadam.net)

Transcribed from the official Kadam publisher wiki, Popunder page.

## Creating a block

Sites → Site name → **Add block** (top-right). Enter a name, select the
**Popunder** format (marked as "Popunder"), click **Next**.

## Block settings

In **General settings** you enter the block name and choose one of three
operating modes:

- **Classic** — a standard popunder that opens when the user clicks anywhere
  on the page.
- **ClickChange** — a popunder with URL substitution on click. When a user
  clicks an active element on the page, the ad page opens instead of the
  expected navigation: the element's original link is replaced with the ad
  link.
- **DirectLink** — a link for monetizing traffic that is not tied to a
  specific page.

The set of available settings depends on the selected mode.

### Panel tooltips (from the ⓘ icons)

- **Classic** — "Opens an ad window on user click, behind the active tab or in
  a new tab"
- **ClickChange** — "Redirects link clicks to a new tab and monetizes the
  current tab via popunder"

---

## Classic mode

### Frequency settings

| Parameter | Description |
|---|---|
| Impressions per interval | How many times the popunder can fire within a single interval |
| Interval between impressions (seconds) | Time between firings |
| Delay before start (seconds) | How many seconds after the page loads the popunder becomes active |
| Delay after impression (seconds) | Pause after a firing before the next possible impression |
| Reset impressions after interval | If enabled, the impression counter resets when the interval expires or after the page is reloaded |

### Trigger elements

- **Included elements** — CSS selectors of elements whose click activates the
  popunder. If the field is empty, the popunder fires on a click anywhere on
  the page.
- **Excluded elements** — CSS selectors of elements whose click does NOT
  activate the popunder. They take priority over included elements.

Selectors are comma-separated. Example: `.tp-ul, .item` — the popunder fires
on a click on the player and on elements with the `item` class.

### Additional settings

**Opening method** — determines how the ad page opens:

- New tab
- Previous tab
- New window

Additional trigger events (optional):

- **Click count** — the popunder fires after the specified number of clicks.
- **Keyboard activity** — fires on keyboard activity.
- **Exit intent** — fires when the user attempts to leave the page.

### Targeting settings

- **Devices** — restrict by device type: All / Desktop / Mobile.
- **Exclude visitors** — Empty referrer, From Yandex Search, From Google
  Search, From Google Chrome Browser, Yandex Browser, In App (Web View).

### Block code

After saving, a JS snippet is generated that must be placed on **every page**
of the site where the Popunder block should work, inside the `<body>` tag:

```html
<script src="https://hdbtop.com/code/<code>450426"></script>
```

The code contains a unique block identifier — each block has its own.

---

## ClickChange mode

A simplified popunder mode. **When the user clicks, the current tab navigates
to the ad URL, and the site opens in a new tab.**

### Frequency settings

Only one parameter is available:

| Parameter | Description |
|---|---|
| Delay after impression (seconds) | Pause after a firing before the next possible impression |

### Additional settings

Same optional trigger events as Classic: Click count, Keyboard activity,
Exit intent.

### Targeting settings

Same as Classic mode: device type and exclude-by-source.

---

## DirectLink mode

A link for monetizing traffic. **Does not require placing any code on the
site.**

### Settings

In **Additional settings**, fill in as needed:

- **SubID** — an additional identifier for grouping earnings statistics.
- **Ref** — an additional identifier for tracking traffic on the publisher's
  side (see the Postback article).
- **Traffic Back URL (optional)** — the page to which users are redirected
  when no ad could be matched to the publisher's request.

> **Be aware** (Kadam's own warning): buying with selling traffic
> simultaneously in Kadam is forbidden. Also Kadam does not accept
> **iframe, proxy, bot, incent or motivated traffic, blogspot traffic**.
> Traffic from other ad networks is allowed only with prior approval from
> your manager. The refusal of traffic will not be paid.

### Result

A ready-to-use link in the form:

```
https://vluluche.com/dc/?blockID=450426
```

The additional parameters (SubID, Ref, Traffic Back URL) are appended to the
link. This link is used wherever traffic needs to be monetized.

### GET parameters

| Parameter | Description |
|---|---|
| `blockID` | Kadam Popunder block identifier |
| `tb` | Redirect URL when no ad is matched (Traffic Back URL) |
| `subID` | An additional identifier for grouping earnings statistics |
| `ref` | An additional identifier for identifying traffic on the publisher's side |
