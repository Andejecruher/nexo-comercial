import type { ExportModule } from '@prisma/client';
import { env } from '../../config/env.config';
import type { GoogleDriveFileStorageProvider } from '../ine/google-drive-file-storage.provider';

export class GoogleDriveModuleFolderResolver {
  private readonly cache = new Map<ExportModule, { id: string; resolvedAt: number }>();

  constructor(private readonly drive: GoogleDriveFileStorageProvider) {}

  async resolve(module: ExportModule): Promise<string> {
    const cached = this.cache.get(module);
    if (cached && Date.now() - cached.resolvedAt < env.EXPORT_FOLDER_CACHE_TTL_MS) return cached.id;
    const id = await this.drive.resolveExportFolder(module);
    this.cache.set(module, { id, resolvedAt: Date.now() });
    return id;
  }
}
