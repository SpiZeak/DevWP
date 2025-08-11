# Database Storage for Site Configurations

This document explains the database storage implementation for DevWP site configurations.

## Overview

DevWP now stores all site configurations in a dedicated database table instead of relying solely on filesystem changes. This provides better data persistence, easier querying, and improved site management capabilities.

## Database Schema

The implementation uses the existing MariaDB container and creates a new database `devwp_config` with a `sites` table:

```sql
CREATE TABLE sites (
  domain VARCHAR(255) PRIMARY KEY,
  aliases TEXT,
  web_root VARCHAR(255),
  multisite_enabled BOOLEAN DEFAULT FALSE,
  multisite_type ENUM('subdomain', 'subdirectory') DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
```

## Features

### Site Configuration Storage
- **Domain**: Primary identifier for the site
- **Aliases**: Space-separated list of domain aliases
- **Web Root**: Custom web root directory (e.g., `public`, `dist`)
- **Multisite**: WordPress multisite configuration (enabled/disabled, type)
- **Timestamps**: Creation and last update times

### Backwards Compatibility
- Automatic migration of existing sites from filesystem to database
- Fallback to filesystem-only mode if database operations fail
- No breaking changes to existing functionality

### Database Operations
- **Initialize**: Creates database and table on first run
- **Save**: Stores/updates site configuration during creation
- **Get**: Retrieves individual site configuration
- **List**: Gets all site configurations with filesystem fallback
- **Delete**: Removes site configuration during site deletion
- **Migrate**: Imports existing filesystem sites to database

## Implementation Details

### Files Modified
- `src/main/services/database.ts` - New database service module
- `src/main/services/site.ts` - Updated to use database storage
- `src/main/index.ts` - Initialize database on startup

### Key Functions

#### Database Service (`database.ts`)
- `initializeConfigDatabase()` - Sets up database and table
- `saveSiteConfiguration(site)` - Stores site configuration
- `getAllSiteConfigurations()` - Retrieves all sites from database
- `getSiteConfiguration(domain)` - Gets specific site configuration
- `deleteSiteConfiguration(domain)` - Removes site from database
- `migrateExistingSites()` - Imports filesystem sites to database

#### Site Service Updates (`site.ts`)
- Enhanced `Site` interface with database fields
- Modified `createSite()` to save configuration to database
- Updated `getSites()` to read from database with migration
- Updated `deleteSite()` to remove database entries

## Usage

The database storage is transparent to users. All existing functionality continues to work:

1. **Site Creation**: Configurations are automatically saved to database
2. **Site Listing**: Reads from database first, with filesystem fallback
3. **Site Deletion**: Removes both filesystem and database entries
4. **Migration**: Existing sites are automatically imported on first run

## Error Handling

- Database operations are wrapped in try/catch blocks
- Graceful fallback to filesystem-only mode if database fails
- Detailed error logging for troubleshooting
- Non-blocking errors for optional features (SonarQube integration)

## Testing

### Manual Testing
Two test scripts are provided for verification:
- `test-database.js` - Basic database CRUD operations
- `test-integration.js` - Site migration and configuration tests

### Test Commands
```bash
# Start MariaDB container
docker compose up mariadb -d

# Run basic database tests
node test-database.js

# Run integration tests  
node test-integration.js

# Clean up
docker compose down
```

## Maintenance

### Database Access
```bash
# Connect to database
docker exec -it devwp_mariadb mariadb -u root -proot -D devwp_config

# View all sites
SELECT * FROM sites;

# Manual cleanup if needed
DELETE FROM sites WHERE domain = 'example.test';
```

### Backup/Restore
Site configurations can be backed up using standard MariaDB tools:
```bash
# Backup
docker exec devwp_mariadb mariadb-dump -u root -proot devwp_config > sites_backup.sql

# Restore
docker exec -i devwp_mariadb mariadb -u root -proot devwp_config < sites_backup.sql
```

## Future Enhancements

Potential improvements for the database storage feature:
- API endpoints for external site management
- Configuration templates and presets
- Site grouping and categorization
- Enhanced metadata storage (PHP version, SSL config, etc.)
- Web-based configuration management interface