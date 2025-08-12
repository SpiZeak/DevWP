# Xdebug Setting Implementation

## Overview

Added database storage for the Xdebug toggle state to persist user preferences across application restarts. The Xdebug setting is now stored in the `devwp_config.settings` table alongside other application settings.

## Features Implemented

### 1. Database Storage

- **Setting Key**: `xdebug_enabled` (boolean stored as string)
- **Default Value**: `false` (performance mode, Xdebug disabled)
- **Storage**: Stored in the existing `devwp_config.settings` table

### 2. Backend Services

- **Database Functions** (`src/main/services/database.ts`):
  - `getXdebugEnabledSetting()`: Get Xdebug setting with default fallback
  - Updated `initializeDefaultSettings()`: Initialize Xdebug setting on first run

- **Xdebug Service Updates** (`src/main/services/xdebug.ts`):
  - `initializeXdebugStatus()`: Initialize status from database on startup
  - Updated `getXdebugStatus()`: Save current status to database
  - Updated `toggleXdebug()`: Save new status after successful toggle

- **IPC Handlers** (`src/main/ipc/settings.ts`):
  - `get-xdebug-enabled-setting`: Get the Xdebug preference from database

### 3. Frontend API

- **Type Definitions** (`src/renderer/src/env.d.ts`):
  - Added `getXdebugEnabledSetting()` to electronAPI interface

- **Preload Script** (`src/renderer/src/preload/index.ts`):
  - Exposed `getXdebugEnabledSetting` API method

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
const isEnabled = await getXdebugEnabledSetting()

// Save Xdebug setting to database
await saveSetting('xdebug_enabled', 'true')
```

### Frontend Access

```typescript
// Get current Xdebug preference
const isEnabled = await window.electronAPI.getXdebugEnabledSetting()
```

## Database Verification

```bash
# View Xdebug setting
docker exec devwp_mariadb mariadb -u root -proot -D devwp_config -e "SELECT * FROM settings WHERE key_name = 'xdebug_enabled';"

# Example output:
# key_name        value_text      updated_at
# xdebug_enabled  false           2025-08-12 15:30:10
```

## Behavior

### On Application Startup

1. Database is initialized with default settings
2. Xdebug service reads saved preference from database
3. If no setting exists, current file state is read and saved
4. Global state is synchronized with database value

### On Xdebug Toggle

1. Configuration file is updated (existing behavior)
2. PHP container is restarted (existing behavior)
3. New status is verified by reading configuration file
4. **New**: Verified status is saved to database for persistence

### Error Handling

- Database failures fall back to file-based status checking
- Missing settings initialize with default values
- Non-critical errors don't prevent application functionality

## Technical Details

- **Persistence**: Settings survive application restarts and container recreations
- **Fallback Strategy**: File-based → Database → Memory → Default (false)
- **Type Safety**: Full TypeScript support with proper interfaces
- **Error Handling**: Graceful degradation on database failures
- **Initialization Order**: Database → Xdebug → Window creation

## Future Enhancements

The implementation enables future Xdebug-related settings:

- Xdebug mode preferences (debug, develop, profile, trace)
- IDE configuration settings
- Remote debugging host/port settings
- Profiling output preferences
- Breakpoint management
