# Xdebug Setting Implementation

## Overview

Added database storage for the Xdebug toggle state to persist user preferences across application restarts. The Xdebug setting is now stored in the `devwp_config.settings` table alongside other application settings.

## Features Implemented

### 1. Database Storage

- **Setting Key**: `xdebug_enabled` (boolean stored as string)
- **Default Value**: `false` (performance mode, Xdebug disabled)
- **Storage**: Stored in the existing `devwp_config.settings` table

### 2. Backend Services

- **Database Functions** (`src/backend/settings.rs`):
  - `getXdebugEnabledSetting()`: Get Xdebug setting with default fallback
  - Updated `initializeDefaultSettings()`: Initialize Xdebug setting on first run

- **Xdebug Service Updates** (`src/backend/xdebug.rs`):
  - `initializeXdebugStatus()`: Initialize status from database on startup
  - Updated `getXdebugStatus()`: Save current status to database
  - Updated `toggleXdebug()`: Save new status after successful toggle

- **Backend functions** (`src/backend/xdebug.rs`):
  - `get-xdebug-enabled-setting`: Get the Xdebug preference from database

### 3. UI Integration

- **Xdebug switch** (`src/components/xdebug_switch.rs`):
  - Calls `xdebug::get_xdebug_status()` directly to read the current state
  - Runs `xdebug::toggle_xdebug()` on toggle; state flows back through the
    `XDEBUG_ENABLED` / `XDEBUG_TOGGLING` signals in `src/state.rs`

### 4. Initialization Process

1. **App Startup**: Initialize database first (`initializeConfigDatabase()`)
2. **Xdebug Init**: Initialize Xdebug status from database (`initializeXdebugStatus()`)
3. **Fallback Logic**: If database fails, read from configuration file
4. **Default Setting**: New installations default to `false` (performance mode)

## Default Configuration

- **Default State**: Disabled (performance mode)
- **Database Key**: `xdebug_enabled`
- **Storage Location**: `devwp_config.settings` table
- **Initialization**: Automatic on first run, preserves existing settings

## Usage

### Backend Access

```typescript
// Get Xdebug setting from database
const isEnabled = await getXdebugEnabledSetting();

// Save Xdebug setting to database
await saveSetting("xdebug_enabled", "true");
```

### Frontend Access

```typescript
// No bridge: components call backend functions directly (see src/components/xdebug_switch.rs)