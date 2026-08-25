import { color } from '../app/design-system';
import { setHighQualityScaling } from '../app/utils';
/**
 * Artone v3 — Media Browser
 * 
 * メディアライブラリ
 * - ファイルインポート
 * - サムネイル生成
 * - メタデータ抽出
 * - 検索/フィルター
 * - ドラッグ&ドロップ
 * 
 * @version 1.0.0
 */

// Some malformed containers / blob-timing edge cases never fire
// onloadedmetadata/onerror at all (proxy-workflow.ts's encodeProxy already
// guards against this exact failure mode for the same reason). Without a
// timeout, importFiles()'s sequential `for...await` loop would hang on that
// one file forever, blocking every subsequent file in the same import batch.
const METADATA_TIMEOUT_MS = 30_000;

// ============================================================
// Types
// ============================================================

/**
 * 復元に必要な最小情報 (`project/project-manager.ts` の `StoredMedia` と構造的に
 * 一致する)。media/ が project/ へ依存しないよう、構造型として受ける。
 */
export interface RestorableMedia {
  id: string;
  name: string;
  type: MediaType;
  blob: Blob;
  meta?: {
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    rotation?: number;
    codec?: string;
    sampleRate?: number;
    channels?: number;
    thumbnail?: string;
  };
  savedAt?: number;
}

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  file: File | null;
  url: string;
  thumbnail: string;
  
  // Video/Image
  width?: number;
  height?: number;
  fps?: number;
  /** 時計回りの回転角 (度)。コンテナのメタデータ由来。0/90/180/270。 */
  rotation?: number;
  
  // Audio
  sampleRate?: number;
  channels?: number;
  
  // Common
  duration: number;
  size: number;
  created: number;
  imported: number;
  
  // Metadata
  codec?: string;
  bitrate?: number;
  tags: string[];
  rating: number;
  favorite: boolean;
  usageCount: number;
}

export type MediaType = 'video' | 'audio' | 'image';

export interface MediaFilter {
  type?: MediaType;
  search?: string;
  tags?: string[];
  favorite?: boolean;
  minDuration?: number;
  maxDuration?: number;
  minRating?: number;
  sortBy?: 'name' | 'date' | 'duration' | 'size' | 'rating';
  sortOrder?: 'asc' | 'desc';
}

export interface ImportProgress {
  file: string;
  progress: number;
  status: 'pending' | 'importing' | 'generating-thumbnail' | 'complete' | 'error';
  error?: string;
}

// ============================================================
// Media Type Detection
// ============================================================

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'ogv'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

/**
 * Classify a file as video/audio/image by its extension (case-insensitive),
 * or null if unrecognized. Exported so the DropZone can accept the same set
 * of containers the file picker does, even when the browser reports an empty
 * or nonstandard MIME type for them (common for .mkv/.mov/.avi).
 */
export function getMediaType(filename: string): MediaType | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  
  return null;
}

// ============================================================
// Media Browser
// ============================================================

export class MediaBrowser {
  private items: Map<string, MediaItem> = new Map();
  private thumbnailCache: Map<string, string> = new Map();
  private listeners: Set<() => void> = new Set();
  // Natural-order collator: "Take 2" sorts before "Take 10" (numeric:true), and
  // case differences don't scatter names (sensitivity:'base'). Built once —
  // Intl.Collator construction is expensive. (Zenn: localeCompare numeric sort)
  private readonly nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  // ============================================================
  // Import
  // ============================================================

  async importFiles(
    files: FileList | File[],
    onProgress?: (progress: ImportProgress) => void
  ): Promise<MediaItem[]> {
    const results: MediaItem[] = [];

    for (const file of files) {
      const type = getMediaType(file.name);
      if (!type) continue;

      onProgress?.({
        file: file.name,
        progress: 0,
        status: 'importing'
      });

      try {
        const item = await this.importFile(file, type, (p) => {
          onProgress?.({
            file: file.name,
            progress: p,
            status: p < 0.9 ? 'importing' : 'generating-thumbnail'
          });
        });

        results.push(item);
        
        onProgress?.({
          file: file.name,
          progress: 1,
          status: 'complete'
        });
      } catch (error) {
        onProgress?.({
          file: file.name,
          progress: 0,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.notify();
    return results;
  }

  private async importFile(
    file: File,
    type: MediaType,
    onProgress?: (progress: number) => void
  ): Promise<MediaItem> {
    const id = crypto.randomUUID();
    const url = URL.createObjectURL(file);

    try {
      let width: number | undefined;
      let height: number | undefined;
      let duration = 0;
      let fps: number | undefined;
      let sampleRate: number | undefined;
      let channels: number | undefined;
      let rotation: number | undefined;
      let codec: string | undefined;
      let thumbnail = '';

      onProgress?.(0.2);

      // Extract metadata based on type
      switch (type) {
        case 'video': {
          const videoMeta = await this.extractVideoMetadataPreferContainer(file, url);
          width = videoMeta.width;
          height = videoMeta.height;
          duration = videoMeta.duration;
          fps = videoMeta.fps;
          rotation = videoMeta.rotation;
          codec = videoMeta.codec;
          thumbnail = await this.generateVideoThumbnail(url, videoMeta.width, videoMeta.height);
          break;
        }

        case 'audio':
          const audioMeta = await this.extractAudioMetadata(url);
          duration = audioMeta.duration;
          sampleRate = audioMeta.sampleRate;
          channels = audioMeta.channels;
          thumbnail = await this.generateAudioWaveform(url);
          break;

        case 'image':
          const imageMeta = await this.extractImageMetadata(url);
          width = imageMeta.width;
          height = imageMeta.height;
          thumbnail = await this.generateImageThumbnail(url);
          break;
      }

      onProgress?.(0.9);

      const item: MediaItem = {
        id,
        name: file.name,
        type,
        file,
        url,
        thumbnail,
        width,
        height,
        fps,
        rotation,
        codec,
        sampleRate,
        channels,
        duration,
        size: file.size,
        created: file.lastModified,
        imported: Date.now(),
        tags: [],
        rating: 0,
        favorite: false,
        usageCount: 0
      };

      this.items.set(id, item);
      this.thumbnailCache.set(id, thumbnail);

      onProgress?.(1);
      return item;
    } catch (e) {
      // A failed import must not leak the object URL created above.
      URL.revokeObjectURL(url);
      throw e;
    }
  }

  // ============================================================
  // Restore (persisted media)
  // ============================================================

  /**
   * 保存済み素材から**取り込み時の ID を保ったまま**ライブラリを復元する。
   *
   * `importFiles()` を使い回さないのは、あれが ID を新規採番しメタデータを
   * 再抽出するため。ID が変わるとクラッシュ復旧で戻したタイムラインのクリップが
   * 指す `mediaId` と一致せず、**復元したのに素材が見つからない**という結果になる。
   * 抽出済みメタデータとサムネイルも保存されたものをそのまま使う (再抽出は高価で、
   * かつ結果が変われば同じ素材が別物として扱われてしまう)。
   *
   * 既にライブラリにある ID は上書きしない (取り込み済みの実体を優先する)。
   *
   * @param records 保存済み素材 (project の media ストア由来)。
   * @returns 実際に復元した件数。
   */
  restoreItems(records: ReadonlyArray<RestorableMedia>): number {
    let restored = 0;
    for (const record of records) {
      if (!record?.id || !record.blob) continue;
      if (this.items.has(record.id)) continue;

      // 保存されているのは Blob なので、File として扱えるよう名前を復元する。
      const file = record.blob instanceof File
        ? record.blob
        : new File([record.blob], record.name, { type: record.blob.type });
      const meta = record.meta ?? {};
      const item: MediaItem = {
        id: record.id,
        name: record.name,
        type: record.type,
        file,
        url: URL.createObjectURL(file),
        thumbnail: meta.thumbnail ?? '',
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        rotation: meta.rotation,
        codec: meta.codec,
        sampleRate: meta.sampleRate,
        channels: meta.channels,
        duration: meta.duration ?? 0,
        size: file.size,
        created: file.lastModified,
        imported: record.savedAt ?? Date.now(),
        tags: [],
        rating: 0,
        favorite: false,
        usageCount: 0,
      };
      this.items.set(item.id, item);
      if (item.thumbnail) this.thumbnailCache.set(item.id, item.thumbnail);
      restored++;
    }
    if (restored > 0) this.notify();
    return restored;
  }

  // ============================================================
  // Metadata Extraction
  // ============================================================

  /**
   * 映像メタデータを取得する。まずコンテナを直接解析し (Mediabunny)、正確な
   * **回転**・**実コーデック**・フレームレートまで得る。解析できない場合
   * (対応外コンテナ・破損等) は従来の `<video>` 経路へフォールバックする
   * (取り込み自体は失敗させない)。
   *
   * 回転付きの縦動画では、`<video>` フォールバックの `videoWidth/Height` は既に
   * 回転適用後の値を返すため、フォールバック時の rotation は 0 として扱う
   * (寸法が二重に入れ替わるのを防ぐ)。
   */
  private async extractVideoMetadataPreferContainer(
    file: File,
    url: string
  ): Promise<{
    width: number;
    height: number;
    duration: number;
    fps: number;
    rotation: number;
    codec: string;
  }> {
    // Mediabunny は全コンテナデマクサを含み重いため、動的 import で別チャンクに
    // 分離し、実際に映像を取り込む時にだけロードする (アプリ起動バンドルを
    // 肥大化させない)。
    const { extractVideoMetadataViaMediabunny } = await import('./media-metadata');
    const meta = await extractVideoMetadataViaMediabunny(file);
    if (meta) {
      return {
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        // コンテナから fps を取れないコーデック等では 0 が返るため既定 30 で補う。
        fps: meta.fps > 0 ? meta.fps : 30,
        rotation: meta.rotation,
        codec: meta.codecString || meta.codec,
      };
    }
    // フォールバック: <video> は回転適用後の寸法を返す。
    const fallback = await this.extractVideoMetadata(url);
    return { ...fallback, rotation: 0, codec: '' };
  }

  private async extractVideoMetadata(url: string): Promise<{
    width: number;
    height: number;
    duration: number;
    fps: number;
  }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      const timer = setTimeout(() => {
        video.onloadedmetadata = null;
        video.onerror = null;
        reject(new Error(`Video metadata load timeout after ${METADATA_TIMEOUT_MS}ms`));
      }, METADATA_TIMEOUT_MS);

      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          fps: 30 // Default, would need ffprobe for accurate fps
        });
      };

      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Failed to load video'));
      };
      video.src = url;
    });
  }

  private async extractAudioMetadata(url: string): Promise<{
    duration: number;
    sampleRate: number;
    channels: number;
  }> {
    return new Promise((resolve, reject) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';

      const timer = setTimeout(() => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        reject(new Error(`Audio metadata load timeout after ${METADATA_TIMEOUT_MS}ms`));
      }, METADATA_TIMEOUT_MS);

      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve({
          duration: audio.duration,
          sampleRate: 48000, // Default
          channels: 2       // Default
        });
      };

      audio.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Failed to load audio'));
      };
      audio.src = url;
    });
  }

  private async extractImageMetadata(url: string): Promise<{
    width: number;
    height: number;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  // ============================================================
  // Thumbnail Generation
  // ============================================================

  private async generateVideoThumbnail(url: string, width: number, height: number): Promise<string> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      // Matches this function's own graceful-fallback convention (resolve
      // with '' on failure, same as onerror below) rather than rejecting —
      // a missing thumbnail should not fail the whole import.
      const timer = setTimeout(() => {
        video.onloadeddata = null;
        video.onseeked = null;
        video.onerror = null;
        resolve('');
      }, METADATA_TIMEOUT_MS);
      const settle = (value: string): void => {
        clearTimeout(timer);
        resolve(value);
      };

      video.onloadeddata = () => {
        video.currentTime = video.duration * 0.1; // 10% into video
      };

      video.onseeked = () => {
        // Corrupted/streaming videos can report 0 dimensions; 160/0 = Infinity
        // would make the canvas size NaN and emit a broken thumbnail. Fail
        // gracefully like the onerror path instead.
        const longest = Math.max(width, height);
        if (!(longest > 0)) { settle(''); return; }
        const canvas = document.createElement('canvas');
        const scale = 160 / longest;
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d')!;
        setHighQualityScaling(ctx);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        settle(canvas.toDataURL('image/jpeg', 0.7));
      };

      video.onerror = () => settle('');
      video.src = url;
    });
  }

  private async generateAudioWaveform(url: string): Promise<string> {
    let audioContext: AudioContext | null = null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`generateAudioWaveform: fetch failed ${response.status} ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const data = audioBuffer.getChannelData(0);
      const samples = 100;
      // Guard: short clips (data.length < samples) gave blockSize=0 → avg=NaN.
      const blockSize = Math.max(1, Math.floor(data.length / samples));

      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = color.surface1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color.brand;

      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          const idx = i * blockSize + j;
          // Guard out-of-bounds reads (Float32Array OOB → undefined → NaN).
          if (idx < data.length) sum += Math.abs(data[idx]);
        }
        const avg = sum / blockSize;
        const barHeight = avg * canvas.height * 2;
        const x = (i / samples) * canvas.width;
        const y = (canvas.height - barHeight) / 2;

        ctx.fillRect(x, y, canvas.width / samples - 1, barHeight);
      }

      return canvas.toDataURL('image/png');
    } catch {
      return ''; // Thumbnail generation failed — return empty string
    } finally {
      // Close in finally so the OS audio context is released even if decodeAudioData throws.
      audioContext?.close();
    }
  }

  private async generateImageThumbnail(url: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        // Broken images can fire onload with 0 intrinsic dimensions; 160/0 =
        // Infinity poisons the canvas size. Fail gracefully like onerror.
        const longest = Math.max(img.width, img.height);
        if (!(longest > 0)) { resolve(''); return; }
        const canvas = document.createElement('canvas');
        const scale = 160 / longest;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d')!;
        setHighQualityScaling(ctx);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };

      img.onerror = () => resolve('');
      img.src = url;
    });
  }

  // ============================================================
  // Query & Filter
  // ============================================================

  getItems(filter?: MediaFilter): MediaItem[] {
    let items = Array.from(this.items.values());

    if (filter) {
      // Type filter
      if (filter.type) {
        items = items.filter(i => i.type === filter.type);
      }

      // Search
      if (filter.search) {
        const search = filter.search.toLowerCase();
        items = items.filter(i => 
          i.name.toLowerCase().includes(search) ||
          i.tags.some(t => t.toLowerCase().includes(search))
        );
      }

      // Tags
      if (filter.tags && filter.tags.length > 0) {
        items = items.filter(i =>
          filter.tags!.every(t => i.tags.includes(t))
        );
      }

      // Favorite
      if (filter.favorite !== undefined) {
        items = items.filter(i => i.favorite === filter.favorite);
      }

      // Duration
      if (filter.minDuration !== undefined) {
        items = items.filter(i => i.duration >= filter.minDuration!);
      }
      if (filter.maxDuration !== undefined) {
        items = items.filter(i => i.duration <= filter.maxDuration!);
      }

      // Rating
      if (filter.minRating !== undefined) {
        items = items.filter(i => i.rating >= filter.minRating!);
      }

      // Sort
      const sortKey = filter.sortBy || 'date';
      const sortOrder = filter.sortOrder || 'desc';

      items.sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case 'name':
            // Natural order so "Take 2" precedes "Take 10" (not lexicographic).
            cmp = this.nameCollator.compare(a.name, b.name);
            break;
          case 'date':
            cmp = a.imported - b.imported;
            break;
          case 'duration':
            cmp = a.duration - b.duration;
            break;
          case 'size':
            cmp = a.size - b.size;
            break;
          case 'rating':
            cmp = a.rating - b.rating;
            break;
        }
        return sortOrder === 'desc' ? -cmp : cmp;
      });
    }

    return items;
  }

  getItem(id: string): MediaItem | undefined {
    return this.items.get(id);
  }

  // ============================================================
  // Item Operations
  // ============================================================

  updateItem(id: string, updates: Partial<MediaItem>): void {
    const item = this.items.get(id);
    if (item) {
      Object.assign(item, updates);
      this.notify();
    }
  }

  setRating(id: string, rating: number): void {
    this.updateItem(id, { rating: Math.max(0, Math.min(5, rating)) });
  }

  toggleFavorite(id: string): void {
    const item = this.items.get(id);
    if (item) {
      this.updateItem(id, { favorite: !item.favorite });
    }
  }

  addTag(id: string, tag: string): void {
    const item = this.items.get(id);
    if (item && !item.tags.includes(tag)) {
      this.updateItem(id, { tags: [...item.tags, tag] });
    }
  }

  removeTag(id: string, tag: string): void {
    const item = this.items.get(id);
    if (item) {
      this.updateItem(id, { tags: item.tags.filter(t => t !== tag) });
    }
  }

  incrementUsage(id: string): void {
    const item = this.items.get(id);
    if (item) {
      this.updateItem(id, { usageCount: item.usageCount + 1 });
    }
  }

  removeItem(id: string): void {
    const item = this.items.get(id);
    if (item) {
      URL.revokeObjectURL(item.url);
      this.items.delete(id);
      this.thumbnailCache.delete(id);
      this.notify();
    }
  }

  // ============================================================
  // Stats
  // ============================================================

  getStats(): {
    totalItems: number;
    videos: number;
    audios: number;
    images: number;
    totalSize: number;
    totalDuration: number;
  } {
    const items = Array.from(this.items.values());
    
    return {
      totalItems: items.length,
      videos: items.filter(i => i.type === 'video').length,
      audios: items.filter(i => i.type === 'audio').length,
      images: items.filter(i => i.type === 'image').length,
      totalSize: items.reduce((sum, i) => sum + i.size, 0),
      totalDuration: items.reduce((sum, i) => sum + i.duration, 0)
    };
  }

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const item of this.items.values()) {
      for (const tag of item.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  // ============================================================
  // Listeners
  // ============================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

