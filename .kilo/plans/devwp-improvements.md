# DevWP Improvement Plan

## Summary

A systematic audit of the DevWP codebase (Tauri v2 + React 19 + Docker Compose) across four dimensions: project architecture, site management backend, Docker/backend infrastructure, and UI layer. Findings are categorized by severity and estimated effort, for incremental implementation.

---

## 🔴 Critical — Bugs Causing Incorrect Behavior

### 1. BuildLog auto-scroll broken
**File:** `src/renderer/src/components/BuildLog.tsx:57-61`  
**Problem:** `useEffect` dependency array is `[isOpen]` but should include `logs`. New log lines stream in but the effect never re-fires, so auto-scroll only triggers on panel toggle.  
**Fix:** Add `logs` to the dependency array.
**Effort:** 5 min

### 2. SiteList scroll effect cascade loop
**File:** `src/renderer/src/components/SiteList/index.tsx:279-281`  
**Problem:** `useEffect(() => { updateScrollBar(); }, [updateScrollBar])` creates an O(n²) render cascade because `updateScrollBar` is wrapped in `useCallback([showScrollBar])` — every scroll bar state change triggers a new callback reference, which re-runs the effect.  
**Fix:** Change dependency to `[sites, loading, searchQuery]` and inline the scroll recalculation.
**Effort:** 10 min

### 3. FormInput `autoFocus` prop is dead code
**File:** `src/renderer/src/components/ui/FormInput.tsx:16`  
**Problem:** `autoFocus: _autoFocus` is destructured with underscore (intentionally unused) but never passed to the `<input>`. The comment says "intentionally kept for UX" but no input ever auto-focuses.  
**Fix:** Wire the prop to `<input autoFocus={autoFocus}>` or remove from the interface.
**Effort:** 2 min

### 4. WP-CLI command splitting breaks quoted arguments
**File:** `src/tauri/src/wp_cli.rs:16`  
**Problem:** `command.split_whitespace().collect()` breaks `wp option update blogname "My Site"` into `["option","update","blogname","\"My","Site\""]` — the quoted string is split across two args.  
**Fix:** Use a shell-words parser like `shell_words::split(&command)` crate or write a simple parser that respects quotes.
**Effort:** 15 min + add `shell_words` dep

---

## 🟠 High — Reliability & UX Degradation

### 5. No rollback on partial site creation failure
**File:** `src/tauri/src/site.rs — create_site()`  
**Problem:** `create_site` writes to `sites.json` early, then performs cert regeneration, nginx config, hosts entry, and WordPress install. If any step after `write_sites` fails, the site is left in an inconsistent state with no rollback.  
**Fix:** Implement a rollback function that reverses each completed step, or defer `write_sites` until all preconditions are met. Log failures at each rollback step.
**Effort:** 2 hours

### 6. Silent error swallowing in delete/update
**File:** `src/tauri/src/site.rs:725,739,743` (delete), `781-782` (update), `218` (nginx_reload)  
**Problem:** `let _ =` swallows failures from cert regeneration, nginx reload, and hosts entry removal. If nginx fails to reload, the user sees "Site deleted" but nginx still serves the old config.  
**Fix:** Collect errors and return a `Vec<String>` of warnings alongside the success result. At minimum, `log::error!` them so they appear in the Tauri log.
**Effort:** 30 min

### 7. No service name validation for Docker commands
**File:** `src/tauri/src/docker.rs — start_service, stop_service`  
**Problem:** `start_service` and `stop_service` accept arbitrary `service_name: String` from the frontend and pass it to `docker compose`. No server-side allowlist.  
**Fix:** Validate against a const allowlist of known services (`["nginx", "php", "mariadb", "redis", "mailpit"]`), return error for unknown names.
**Effort:** 10 min

### 8. No timeout on Docker/CLI commands
**Files:** `src/tauri/src/utils.rs`, `src/tauri/src/wp_cli.rs`  
**Problem:** Neither `run_command` nor `run_command_streaming` implements a timeout. A hung Docker daemon or stuck process blocks the thread indefinitely.  
**Fix:** Use `std::process::Command` with `wait_timeout` or wrap with `tokio::time::timeout`. Provide a reasonable default (5 min for Docker, 30s for WP-CLI). Return a clear timeout error to the frontend.
**Effort:** 30 min

### 9. BuildLog vanishes on build completion
**File:** `src/renderer/src/components/BuildLog.tsx:63-66`  
**Problem:** `return isBuilding && (...)` means the entire component including accumulated logs disappears the moment a build completes. Users cannot review what happened.  
**Fix:** Keep the panel visible (collapsed) with a "Build complete" header and the full log content. Only hide when the build panel is manually closed.
**Effort:** 15 min

### 10. XdebugSwitch stuck in loading on fetch/toggle failure
**File:** `src/renderer/src/components/XdebugSwitch.tsx:15-19,52-57`  
**Problem:** If `invoke('get_xdebug_status')` fails, `xdebugEnabled` stays `null` forever. If the `xdebug-status` event never arrives after toggle, the toggle stays disabled indefinitely.  
**Fix:** Set `xdebugEnabled = false` as fallback on fetch error (show a warning indicator). Add a 15s timeout that resets `isToggling` if the event doesn't arrive.
**Effort:** 20 min

### 11. No window minWidth/minHeight
**File:** `src/tauri/tauri.conf.json`  
**Problem:** The window is resizable with no minimum dimensions. The grid layout breaks below ~700px width.  
**Fix:** Add `"minWidth": 800, "minHeight": 600` to the window config.
**Effort:** 2 min

---

## 🟡 Medium — Code Quality & UX Polish

### 12. Settings save/load errors only console-logged
**File:** `src/renderer/src/components/Settings/SettingsModal.tsx:25-27,53-57`  
**Problem:** Both load failure and save failure only call `console.error`. User gets no visual feedback.  
**Fix:** Use `emit('notification', { type: 'error', message })` for both cases. For save, also show inline error text near the submit button.
**Effort:** 15 min

### 13. No double-submit guard in CreateSiteModal
**File:** `src/renderer/src/components/SiteList/CreateSiteModal.tsx`  
**Problem:** The "Create" button has no loading lock. User can double-click and submit the form multiple times, potentially creating duplicate sites or corrupting state.  
**Fix:** Add `const [submitting, setSubmitting] = useState(false)` and disable the submit button / show spinner while `submitting` is true. Reset on success/error.
**Effort:** 10 min

### 14. No double-submit guard in EditSiteModal
**File:** `src/renderer/src/components/SiteList/EditSiteModal.tsx`  
**Problem:** Same issue as CreateSiteModal — "Save Changes" button is not disabled during the async update.  
**Fix:** Add submitting state, disable buttons, show spinner on Save.
**Effort:** 10 min

### 15. EditSiteModal saves even when nothing changed
**File:** `src/renderer/src/components/SiteList/EditSiteModal.tsx`  
**Problem:** Opening and closing the edit modal immediately still triggers a full `update_site` call (cert regeneration, nginx config rewrite, reload) when no values were modified.  
**Fix:** Track original values, compute `hasChanges` inline, disable the Save button when nothing changed.
**Effort:** 5 min

### 16. SettingsModal `hasChanges` computed via effect
**File:** `src/renderer/src/components/Settings/SettingsModal.tsx:38-40`  
**Problem:** `hasChanges` is set in a `useEffect` rather than computed inline, adding an unnecessary render cycle.  
**Fix:** Compute directly: `const hasChanges = webrootPath !== originalWebrootPath;`
**Effort:** 2 min

### 17. Versions modal not lazy-loaded
**File:** `src/renderer/src/components/App.tsx:41`  
**Problem:** `SettingsModal` is lazy-loaded but `Versions` is eagerly rendered on every render. Inconsistent and adds to initial bundle.  
**Fix:** Wrap Versions in `React.lazy()` like other modals.
**Effort:** 5 min

### 18. Missing `<h1>` — no page-level heading
**Files:** `App.tsx`, `Services.tsx`, `SiteList/index.tsx`  
**Problem:** The document has no `<h1>` heading. Screen readers navigating by heading have no root landmark. The footer uses `<h6>` which implies a heading hierarchy that doesn't exist.  
**Fix:** Add `<h1 className="sr-only">DevWP</h1>` in App.tsx. Change footer `<h6>` to `<p>`.
**Effort:** 5 min

### 19. `Site.status` typed as loose `string`
**File:** `src/renderer/src/env.d.ts:7`  
**Problem:** `status: string` allows any string. The actual values used are `'provisioning'`, `'active'`, `'pending'`, `'building'`, `'exited'`, `'stopped'`.  
**Fix:** Change to a string union type.
**Effort:** 5 min

### 20. `OperationResult` returned by backend but ignored by frontend
**Files:** `src/tauri/src/site.rs`, `src/renderer/src/components/SiteList/index.tsx`  
**Problem:** `delete_site` and `update_site` return `OperationResult { success, error }` but the frontend handlers catch only invoke-level errors and ignore the result.  
**Fix:** Check `result.success` and emit a notification on failure, or remove the `OperationResult` wrapper and let backend errors propagate as invoke rejections.
**Effort:** 15 min

### 21. No `sites.json` file locking
**File:** `src/tauri/src/site.rs — read_sites, write_sites`  
**Problem:** Two concurrent `create_site` commands can read-modify-write and lose one site.  
**Fix:** Use a `Mutex` around sites operations (in Tauri managed state) or use file locking. Low frequency in practice (single user, serialized Tauri commands), but worth addressing.
**Effort:** 30 min

---

## 🟢 Low — Polish & Cleanup

### 22. Remove dead `EXCLUDED_CONTAINERS` empty array
**File:** `src/renderer/src/components/Services.tsx:57`  
**Fix:** Remove the empty array and the `.filter()` that uses it, or delete entirely.

### 23. Accessibility: Icon component missing `aria-hidden`
**File:** `src/renderer/src/components/ui/Icon.tsx`  
**Fix:** Add `aria-hidden="true"` to the `<span>`. All usages are decorative.

### 24. Accessibility: Search input missing label
**File:** `src/renderer/src/components/SiteList/index.tsx:368`  
**Fix:** Add `aria-label="Search sites"` to the `<input>`.

### 25. Accessibility: BuildLog toggle missing `aria-expanded`/`aria-controls`
**File:** `src/renderer/src/components/BuildLog.tsx:68`  
**Fix:** Add `aria-expanded={isOpen}` and `aria-controls="build-log-content"` to the toggle button.

### 26. Accessibility: Toggle decorative div missing `aria-hidden`
**File:** `src/renderer/src/components/ui/Toggle.tsx:24`  
**Fix:** Add `aria-hidden="true"` to the visual indicator div.

### 27. ComposerModal can't re-run without closing
**File:** `src/renderer/src/components/SiteList/ComposerModal.tsx`  
**Fix:** Add a "Run Again" button or reset `confirmed` after completion.

### 28. WpCliModal/ComposerModal output areas don't auto-scroll
**Files:** `WpCliModal.tsx`, `ComposerModal.tsx`  
**Fix:** Add `useEffect` watching `output` to scroll the pre container.

### 29. Eliminate redundant `useEffect` calls in SiteList
**File:** `src/renderer/src/components/SiteList/index.tsx:283-299`  
**Fix:** Consolidate 4 separate resize/scroll effects into 1–2 with correct dependencies.

### 30. `elevate_append_hosts` silent stdin failure
**File:** `src/tauri/src/site.rs:348-369`  
**Problem:** If `child.stdin.take()` returns `None`, the content is silently not written but returns `Ok(())`.  
**Fix:** Check the `Option` from `.take()` and return an error if `None`.

### 31. WordPress admin email not validated
**File:** `src/renderer/src/components/SiteList/CreateSiteModal.tsx`  
**Fix:** The input has `type="email"` but form submission is via `onClick`, not native form submit, so browser validation doesn't fire. Add manual email format check or use the Constraint Validation API.

### 32. `docker compose down` blocks UI thread on close
**File:** `src/tauri/src/lib.rs:158-180`  
**Fix:** Move `docker compose down` to `spawn_blocking` and allow the window to close while the process runs in background.

### 33. Nginx healthcheck tests config validity, not liveness
**File:** `compose.yml` (nginx healthcheck)  
**Fix:** Change from `nginx -t` to `curl -f http://localhost/` or `curl -fk https://localhost/` to test actual liveness.

### 34. MariaDB root accessible from any host with weak password
**File:** `compose.yml:37-38`  
**Fix:** Change `MARIADB_ROOT_HOST: '%'` to `localhost` since external access isn't needed (port 3306 is exposed for development tools, but root shouldn't accept remote connections).

### 35. Winston logging dependency appears unused
**File:** `package.json`  
**Note:** The app uses `@tauri-apps/plugin-log` for logging. The `winston` + `winston-daily-rotate-file` + `logform` + `triple-beam` dependencies are ~2MB and appear vestigial from a pre-Tauri codebase. Verify and remove if unused.

---

## 📊 Improvement Summary by Category

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Bug fixes | 4 | — | — | 2 | 6 |
| Reliability | — | 4 | 3 | 3 | 10 |
| UX | — | 2 | 2 | 3 | 7 |
| Accessibility | — | — | — | 5 | 5 |
| Code quality | — | — | 5 | 1 | 6 |
| Security | — | 1 | — | 1 | 2 |
| **Total** | **4** | **7** | **10** | **15** | **36** |

**Estimated total effort:** ~8–10 hours for all items, or ~3–4 hours for critical + high items only.

---

## Recommended Implementation Order

1. **Quick wins first** (items 3, 11, 16, 18, 19, 22): Under 30 min total, immediate quality impact
2. **Critical bugs** (items 1, 2, 4): The three actual bugs causing wrong behavior
3. **High reliability** (items 5, 6, 7, 8): Prevent data loss and improve error handling
4. **High UX** (items 9, 10): Fix hanging states and missing feedback
5. **Medium polish** (items 12–15, 17, 20): Submit guards, missing error feedback, lazy loading
6. **Accessibility sweep** (items 23–26): All `aria-*` fixes — quick and high-impact for screen reader users
7. **Low cleanup** (items 27–35): Addressing tech debt and optional improvements
