import { z } from 'zod'

// Site configuration schema
export const SiteConfigSchema = z.object({
  domain: z
    .string()
    .min(1, 'Domain is required')
    .regex(
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i,
      'Invalid domain format'
    ),
  webRoot: z.string().optional(),
  aliases: z.string().optional(),
  multisite: z
    .object({
      enabled: z.boolean(),
      type: z.enum(['subdomain', 'subdirectory']).optional()
    })
    .optional()
})

// Settings validation schema
export const SettingsSchema = z.object({
  webroot_path: z.string().min(1, 'Webroot path is required'),
  xdebug_enabled: z.enum(['true', 'false'])
})

// Container configuration schema
export const ContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  version: z.string().optional(),
  health: z.enum(['healthy', 'unhealthy', 'starting', 'none']).optional()
})

// WP-CLI command schema
export const WpCliCommandSchema = z.object({
  site: z.object({
    domain: z.string(),
    webRoot: z.string().optional()
  }),
  command: z.string().min(1, 'Command is required')
})

// Database name validation
export const DatabaseNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_]+$/, 'Database name must contain only letters, numbers, and underscores')

// Export types for TypeScript
export type SiteConfig = z.infer<typeof SiteConfigSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type Container = z.infer<typeof ContainerSchema>
export type WpCliCommand = z.infer<typeof WpCliCommandSchema>
