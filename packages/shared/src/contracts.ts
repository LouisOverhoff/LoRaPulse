import { z } from 'zod';

export const SetupBootstrapSchema = z.object({
  setupToken: z.string().min(8),
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  password: z.string().min(10).max(128),
  preferredLang: z.enum(['de', 'en']).default('de'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const RedeemInviteSchema = z.object({
  token: z.string().min(16),
  displayName: z.string().min(2).max(80).optional(),
  password: z.string().min(10).max(128),
  preferredLang: z.enum(['de', 'en']).default('de'),
});

export const CreateInviteUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  systemRole: z.enum(['ADMIN', 'USER']).default('USER'),
  groupIds: z.array(z.string()).default([]),
});

export const CreateGroupSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(240).default(''),
  memberUserIds: z.array(z.string()).default([]),
});

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(80),
  parentId: z.string().nullable().default(null),
});

export const CreatePermissionSchema = z
  .object({
    userId: z.string().nullable().default(null),
    groupId: z.string().nullable().default(null),
    categoryId: z.string().nullable().default(null),
    deviceId: z.string().nullable().default(null),
    level: z.enum(['VIEWER', 'OPERATOR', 'CATEGORY_ADMIN']),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.groupId), {
    message: 'Exactly one of userId or groupId must be provided',
  })
  .refine((v) => Boolean(v.categoryId) !== Boolean(v.deviceId), {
    message: 'Exactly one of categoryId or deviceId must be provided',
  });

export const CreateTtnApplicationSchema = z.object({
  name: z.string().min(2).max(80),
  ttnAppId: z.string().min(2).max(100),
  host: z.string().min(3).max(200).default('eu1.cloud.thethings.network'),
  port: z.number().int().min(1).max(65535).default(8883),
  useTls: z.boolean().default(true),
  apiKey: z.string().min(8).max(512),
  isEnabled: z.boolean().default(true),
});

export const UpdateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryId: z.string().nullable().optional(),
  sensorProfileId: z.string().min(1).max(80).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  locationLabel: z.string().max(120).nullable().optional(),
  config: z
    .object({
      invertContact: z.boolean().optional(),
      customOpenLabel: z.object({ de: z.string(), en: z.string() }).optional(),
      customClosedLabel: z.object({ de: z.string(), en: z.string() }).optional(),
      alertOnOpen: z.boolean().optional(),
      tempMinThreshold: z.number().nullable().optional(),
      tempMaxThreshold: z.number().nullable().optional(),
      expectedIntervalSec: z.number().int().min(60).max(604800).optional(),
    })
    .optional(),
});

export const SaveSensorProfileSchema = z.object({
  id: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(2).max(80),
  brand: z.string().max(50).default('custom'),
  model: z.string().max(50).default('custom'),
  icon: z.enum(['door', 'thermometer', 'cloud', 'activity', 'radio']).default('radio'),
  batteryChemistry: z.enum(['li_socl2_3v6', 'alkaline_3v0', 'none']).default('li_socl2_3v6'),
  downlinkIntervalCodec: z.enum(['dragino_tdc_port2', 'none']).default('none'),
  fields: z.array(
    z.object({
      key: z.string().min(1).max(80),
      label: z.object({ de: z.string().min(1), en: z.string().min(1) }),
      kind: z.enum(['number', 'contact', 'battery', 'counter']),
      unit: z.string().max(20).default(''),
      decimals: z.number().int().min(0).max(4).optional(),
      isPrimary: z.boolean().optional(),
      validMin: z.number().optional(),
      validMax: z.number().optional(),
      contactLabels: z
        .object({
          closed: z.object({ de: z.string(), en: z.string() }),
          open: z.object({ de: z.string(), en: z.string() }),
        })
        .optional(),
    })
  ),
});

export const QueueDownlinkSchema = z.object({
  intervalMinutes: z.number().int().min(1).max(10080),
});
