# DevWP Settings Implementation

## Overview

Successfully implemented a settings page with webroot path configuration for DevWP. The settings are stored in a key/value table in the `devwp_config` database.

## Features Implemented

### 1. Database Schema

- **Settings Table**: `devwp_config.settings` with key/value storage
  - `key_name` (VARCHAR): Setting identifier
  - `value_text` (TEXT): Setting value
  - `updated_at` (DATETIME): Automatic timestamp tracking

### 2. Backend Services

- **Database Functions** (`src/main/services/database.ts`):
  - `initializeConfigDatabase()`: Creates settings table alongside sites table
  - `saveSetting(key, value)`: Store/update setting
  - `getSetting(key)`: Retrieve setting value
  - `getAllSettings()`: Get all settings as object
  - `deleteSetting(key)`: Remove setting
  - `getWebrootPath()`: Get webroot with default fallback
  - `initializeDefaultSettings()`: Sets default webroot to `$HOME/www`

- **IPC Handlers** (`src/main/ipc/settings.ts`):
  - Settings CRUD operations
  - Directory picker dialog for webroot selection

### 3. Frontend Components

- **Settings Modal** (`src/renderer/src/components/Settings/SettingsModal.tsx`):
  - Webroot path configuration with file browser
  - Form validation and change tracking
  - Loading states and error handling

- **Services Component** (`src/renderer/src/components/Services.tsx`):
  - Added settings gear button in header
  - Integrated with App component

### 4. UI Integration

- **App Component** (`src/renderer/src/components/App.tsx`):
  - Lazy-loaded settings modal
  - State management for modal visibility

### 5. Type Definitions

- **API Types** (`src/renderer/src/env.d.ts`):
  - Complete settings API interface
  - Directory picker function

## Default Configuration

- **Default Webroot Path**: `$HOME/www` (e.g., `/home/max/www`)
- **Database**: Settings stored in `devwp_config.settings` table
- **Initialization**: Automatic on first run, preserves existing settings

## Usage

1. **Access Settings**: Click the gear (⚙) icon in the Services section
2. **Configure Webroot**:
   - Type path manually or use folder browser button (📁)
   - Default shows current setting from database
3. **Save Changes**: Click "Save Settings" to persist to database
4. **Validation**: Shows unsaved changes indicator

## Database Verification

```bash
# View current settings
docker exec devwp_mariadb mariadb -u root -proot -D devwp_config -e "SELECT * FROM settings;"

# Example output:
# key_name        value_text      updated_at
# webroot_path    /home/max/www   2025-08-12 15:15:10
```

## Technical Details

- **Error Handling**: Graceful fallback to default values if database fails
- **Async Operations**: Proper promise handling throughout
- **Type Safety**: Full TypeScript support with proper interfaces
- **Hot Module Replacement**: Development-friendly with HMR support
- **SQL Injection Protection**: Parameterized queries with escaping

## Future Enhancements

The key/value settings table structure makes it easy to add more configuration options:

- PHP version selection
- SSL configuration preferences
- Development tool settings
- UI theme preferences
- Container resource limits
