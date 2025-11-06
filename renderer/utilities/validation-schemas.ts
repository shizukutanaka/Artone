import { z } from 'zod';

// Base schemas
export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email();
export const URLSchema = z.string().url();

// Timeline schemas
export const TimelineClipSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['video', 'audio', 'image', 'text']),
  start: z.number().min(0),
  duration: z.number().min(0.1),
  trackId: UUIDSchema,
  effects: z.array(z.object({
    id: UUIDSchema,
    type: z.string(),
    name: z.string(),
    parameters: z.record(z.any()),
    startTime: z.number().optional(),
    endTime: z.number().optional()
  })).default([]),
  properties: z.record(z.any()).default({})
});

export const TimelineTrackSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1, 'Track name is required'),
  type: z.enum(['video', 'audio', 'text']),
  clips: z.array(TimelineClipSchema).default([])
});

export const TimelineStateSchema = z.object({
  clips: z.array(TimelineClipSchema),
  tracks: z.array(TimelineTrackSchema),
  selectedClipId: z.string().uuid().nullable(),
  playhead: z.number().min(0),
  duration: z.number().min(1),
  zoom: z.number().min(0.1).max(5.0),
  isPlaying: z.boolean(),
  volume: z.number().min(0).max(1),
  muted: z.boolean()
});

// Project schemas
export const ProjectMetadataSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([])
});

export const ProjectSchema = z.object({
  metadata: ProjectMetadataSchema,
  timeline: TimelineStateSchema,
  settings: z.object({
    theme: z.enum(['light', 'dark', 'auto']).default('dark'),
    language: z.string().default('ja'),
    autosave: z.boolean().default(true),
    autosaveInterval: z.number().default(30000),
    playback: z.object({
      frameRate: z.number().min(1).max(120).default(30),
      quality: z.enum(['low', 'medium', 'high']).default('medium'),
      loop: z.boolean().default(false)
    }),
    export: z.object({
      format: z.enum(['webm', 'mp4']).default('webm'),
      quality: z.enum(['low', 'medium', 'high']).default('medium'),
      includeAudio: z.boolean().default(true),
      includeVideo: z.boolean().default(true)
    })
  })
});

// Export schemas
export const ExportOptionsSchema = z.object({
  format: z.enum(['webm', 'mp4']),
  quality: z.enum(['low', 'medium', 'high']),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  includeAudio: z.boolean(),
  includeVideo: z.boolean(),
  outputPath: z.string().optional()
});

// Settings schemas
export const AppSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']),
  language: z.string(),
  autosave: z.boolean(),
  autosaveInterval: z.number().min(1000),
  playback: z.object({
    frameRate: z.number().min(1).max(120),
    quality: z.enum(['low', 'medium', 'high']),
    loop: z.boolean()
  }),
  export: z.object({
    format: z.enum(['webm', 'mp4']),
    quality: z.enum(['low', 'medium', 'high']),
    includeAudio: z.boolean(),
    includeVideo: z.boolean()
  }),
  shortcuts: z.record(z.string(), z.string()).default({}),
  plugins: z.array(z.string()).default([])
});

// User schemas
export const UserPreferencesSchema = z.object({
  id: UUIDSchema,
  email: EmailSchema,
  name: z.string().min(1),
  avatar: URLSchema.optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'auto']).default('dark'),
    language: z.string().default('ja'),
    notifications: z.object({
      email: z.boolean().default(true),
      push: z.boolean().default(true),
      desktop: z.boolean().default(true)
    }),
    privacy: z.object({
      analytics: z.boolean().default(false),
      crashReporting: z.boolean().default(false),
      usageStats: z.boolean().default(false)
    })
  })
});

// API response schemas
export const APIResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional()
  }).optional(),
  timestamp: z.string().datetime()
});

export const PaginatedResponseSchema = z.object({
  data: z.array(z.any()),
  pagination: z.object({
    page: z.number().min(1),
    limit: z.number().min(1),
    total: z.number().min(0),
    totalPages: z.number().min(0)
  })
});

// Form validation schemas
export const LoginFormSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().default(false)
});

export const RegisterFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: EmailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const ProjectCreateFormSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  template: z.enum(['blank', 'tutorial', 'demo']).default('blank')
});

export const ExportFormSchema = z.object({
  format: z.enum(['webm', 'mp4']),
  quality: z.enum(['low', 'medium', 'high']),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  outputName: z.string().min(1, 'Output name is required'),
  includeAudio: z.boolean(),
  includeVideo: z.boolean()
});

// Validation utilities
export class ValidationError extends Error {
  constructor(
    public errors: z.ZodError['errors'],
    message: string = 'Validation failed'
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DataValidator {
  private static validateWithSchema<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    context?: string
  ): T {
    try {
      const result = schema.parse(data);

      // Log successful validation in development
      if (process.env.NODE_ENV === 'development' && context) {
        console.log(`✅ Validation passed for ${context}:`, result);
      }

      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError(error.errors, `Validation failed${context ? ` for ${context}` : ''}`);

        // Log validation errors
        console.error('❌ Validation failed:', {
          context,
          errors: error.errors,
          data: JSON.stringify(data, null, 2)
        });

        throw validationError;
      }
      throw error;
    }
  }

  // Timeline validation
  static validateTimelineState(data: unknown): TimelineStateSchema {
    return this.validateWithSchema(TimelineStateSchema, data, 'TimelineState');
  }

  static validateTimelineClip(data: unknown): TimelineClipSchema {
    return this.validateWithSchema(TimelineClipSchema, data, 'TimelineClip');
  }

  static validateTimelineTrack(data: unknown): TimelineTrackSchema {
    return this.validateWithSchema(TimelineTrackSchema, data, 'TimelineTrack');
  }

  // Project validation
  static validateProject(data: unknown): ProjectSchema {
    return this.validateWithSchema(ProjectSchema, data, 'Project');
  }

  static validateProjectMetadata(data: unknown): ProjectMetadataSchema {
    return this.validateWithSchema(ProjectMetadataSchema, data, 'ProjectMetadata');
  }

  // Export validation
  static validateExportOptions(data: unknown): ExportOptionsSchema {
    return this.validateWithSchema(ExportOptionsSchema, data, 'ExportOptions');
  }

  // Settings validation
  static validateAppSettings(data: unknown): AppSettingsSchema {
    return this.validateWithSchema(AppSettingsSchema, data, 'AppSettings');
  }

  static validateUserPreferences(data: unknown): UserPreferencesSchema {
    return this.validateWithSchema(UserPreferencesSchema, data, 'UserPreferences');
  }

  // Form validation
  static validateLoginForm(data: unknown): LoginFormSchema {
    return this.validateWithSchema(LoginFormSchema, data, 'LoginForm');
  }

  static validateRegisterForm(data: unknown): RegisterFormSchema {
    return this.validateWithSchema(RegisterFormSchema, data, 'RegisterForm');
  }

  static validateProjectCreateForm(data: unknown): ProjectCreateFormSchema {
    return this.validateWithSchema(ProjectCreateFormSchema, data, 'ProjectCreateForm');
  }

  static validateExportForm(data: unknown): ExportFormSchema {
    return this.validateWithSchema(ExportFormSchema, data, 'ExportForm');
  }

  // API validation
  static validateAPIResponse(data: unknown): APIResponseSchema {
    return this.validateWithSchema(APIResponseSchema, data, 'APIResponse');
  }

  static validatePaginatedResponse(data: unknown): PaginatedResponseSchema {
    return this.validateWithSchema(PaginatedResponseSchema, data, 'PaginatedResponse');
  }

  // Generic validation
  static validateData<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): T {
    return this.validateWithSchema(schema, data, context);
  }

  // Safe validation (returns result instead of throwing)
  static safeValidateData<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    context?: string
  ): { success: true; data: T } | { success: false; errors: z.ZodError['errors'] } {
    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, errors: error.errors };
      }
      throw error;
    }
  }

  // Schema composition utilities
  static createOptionalSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
    const entries = Object.entries(schema.shape).map(([key, value]) => [
      key,
      (value as z.ZodTypeAny).optional()
    ]);
    return z.object(Object.fromEntries(entries));
  }

  static createPartialSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
    return schema.partial();
  }

  static createPickSchema<
    T extends z.ZodRawShape,
    K extends keyof T
  >(schema: z.ZodObject<T>, keys: K[]) {
    return schema.pick(keys as any);
  }

  static createOmitSchema<
    T extends z.ZodRawShape,
    K extends keyof T
  >(schema: z.ZodObject<T>, keys: K[]) {
    return schema.omit(keys as any);
  }
}

// Export validation middleware for API calls
export const validateRequest = (schema: z.ZodSchema, data: unknown, context?: string) => {
  return DataValidator.validateData(schema, data, context);
};

export const safeValidateRequest = (schema: z.ZodSchema, data: unknown, context?: string) => {
  return DataValidator.safeValidateData(schema, data, context);
};

// Type exports
export type TimelineState = z.infer<typeof TimelineStateSchema>;
export type TimelineClip = z.infer<typeof TimelineClipSchema>;
export type TimelineTrack = z.infer<typeof TimelineTrackSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type APIResponse = z.infer<typeof APIResponseSchema>;
export type PaginatedResponse = z.infer<typeof PaginatedResponseSchema>;

// Form types
export type LoginForm = z.infer<typeof LoginFormSchema>;
export type RegisterForm = z.infer<typeof RegisterFormSchema>;
export type ProjectCreateForm = z.infer<typeof ProjectCreateFormSchema>;
export type ExportForm = z.infer<typeof ExportFormSchema>;
