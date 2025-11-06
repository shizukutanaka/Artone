import { FFmpegKit } from 'ffmpeg-kit-react-native';
import RNFS from 'react-native-fs';

export class MobileVideoProcessor {
  private static instance: MobileVideoProcessor;

  static getInstance(): MobileVideoProcessor {
    if (!MobileVideoProcessor.instance) {
      MobileVideoProcessor.instance = new MobileVideoProcessor();
    }
    return MobileVideoProcessor.instance;
  }

  /**
   * 動画を処理して出力ファイルを作成
   */
  async processVideo(
    inputPath: string,
    outputPath: string,
    options: VideoProcessingOptions = {}
  ): Promise<ProcessingResult> {
    try {
      const {
        startTime = 0,
        duration,
        width,
        height,
        bitrate = '2000k',
        fps = 30,
        format = 'mp4',
        codec = 'libx264'
      } = options;

      // 入力ファイルの存在確認
      const inputExists = await RNFS.exists(inputPath);
      if (!inputExists) {
        throw new Error(`Input file does not exist: ${inputPath}`);
      }

      // 出力ディレクトリの作成
      const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
      const dirExists = await RNFS.exists(outputDir);
      if (!dirExists) {
        await RNFS.mkdir(outputDir);
      }

      // FFmpegコマンドの構築
      let command = `-i "${inputPath}"`;

      if (startTime > 0) {
        command += ` -ss ${startTime}`;
      }

      if (duration) {
        command += ` -t ${duration}`;
      }

      if (width && height) {
        command += ` -vf scale=${width}:${height}`;
      }

      command += ` -b:v ${bitrate} -r ${fps} -c:v ${codec}`;

      if (format === 'mp4') {
        command += ' -movflags +faststart';
      }

      command += ` "${outputPath}"`;

      console.log('FFmpeg command:', command);

      // FFmpeg実行
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();
      const output = await session.getOutput();

      if (returnCode.isValueSuccess()) {
        return {
          success: true,
          outputPath,
          message: 'Video processed successfully',
          metadata: {
            command,
            output
          }
        };
      } else {
        const error = await session.getAllLogsAsString();
        throw new Error(`FFmpeg failed: ${error}`);
      }
    } catch (error) {
      console.error('Video processing failed:', error);
      return {
        success: false,
        error: error.message,
        outputPath: null
      };
    }
  }

  /**
   * 動画のメタデータを取得
   */
  async getVideoMetadata(filePath: string): Promise<VideoMetadata | null> {
    try {
      const command = `-i "${filePath}" -v quiet -print_format json -show_format -show_streams`;
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (returnCode.isValueSuccess()) {
        const output = await session.getOutput();
        const metadata = JSON.parse(output);

        return {
          duration: parseFloat(metadata.format.duration || '0'),
          width: parseInt(metadata.streams.find(s => s.codec_type === 'video')?.width || '0'),
          height: parseInt(metadata.streams.find(s => s.codec_type === 'video')?.height || '0'),
          bitrate: parseInt(metadata.format.bit_rate || '0'),
          format: metadata.format.format_name,
          size: parseInt(metadata.format.size || '0')
        };
      }
    } catch (error) {
      console.error('Failed to get video metadata:', error);
    }

    return null;
  }

  /**
   * 動画からサムネイルを生成
   */
  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    time: number = 1
  ): Promise<boolean> {
    try {
      const command = `-i "${inputPath}" -ss ${time} -vframes 1 -vf scale=320:240 "${outputPath}"`;
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      return returnCode.isValueSuccess();
    } catch (error) {
      console.error('Thumbnail generation failed:', error);
      return false;
    }
  }

  /**
   * 動画をトリミング
   */
  async trimVideo(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<ProcessingResult> {
    return this.processVideo(inputPath, outputPath, {
      startTime,
      duration,
      codec: 'copy' // 高速処理のためコピー
    });
  }

  /**
   * 動画の解像度を変更
   */
  async resizeVideo(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number
  ): Promise<ProcessingResult> {
    return this.processVideo(inputPath, outputPath, {
      width,
      height
    });
  }

  /**
   * 動画を結合
   */
  async concatenateVideos(
    inputPaths: string[],
    outputPath: string
  ): Promise<ProcessingResult> {
    try {
      if (inputPaths.length < 2) {
        throw new Error('At least 2 input files required for concatenation');
      }

      // 一時ファイルリストの作成
      const concatListPath = `${RNFS.TemporaryDirectoryPath}/concat_list.txt`;
      let concatList = '';

      for (const inputPath of inputPaths) {
        concatList += `file '${inputPath}'\n`;
      }

      await RNFS.writeFile(concatListPath, concatList, 'utf8');

      const command = `-f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`;
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      // 一時ファイルの削除
      await RNFS.unlink(concatListPath);

      if (returnCode.isValueSuccess()) {
        return {
          success: true,
          outputPath,
          message: 'Videos concatenated successfully'
        };
      } else {
        throw new Error('FFmpeg concatenation failed');
      }
    } catch (error) {
      console.error('Video concatenation failed:', error);
      return {
        success: false,
        error: error.message,
        outputPath: null
      };
    }
  }

  /**
   * 動画にエフェクトを適用
   */
  async applyEffect(
    inputPath: string,
    outputPath: string,
    effect: VideoEffect
  ): Promise<ProcessingResult> {
    try {
      let command = `-i "${inputPath}"`;

      switch (effect.type) {
        case 'brightness':
          command += ` -vf eq=brightness=${effect.parameters.brightness || 0}`;
          break;
        case 'contrast':
          command += ` -vf eq=contrast=${effect.parameters.contrast || 1}`;
          break;
        case 'saturation':
          command += ` -vf eq=saturation=${effect.parameters.saturation || 1}`;
          break;
        case 'blur':
          command += ` -vf boxblur=${effect.parameters.radius || 2}`;
          break;
        case 'sharpen':
          command += ` -vf unsharp=5:5:1.0`;
          break;
        default:
          throw new Error(`Unsupported effect: ${effect.type}`);
      }

      command += ` "${outputPath}"`;

      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (returnCode.isValueSuccess()) {
        return {
          success: true,
          outputPath,
          message: 'Effect applied successfully'
        };
      } else {
        throw new Error('FFmpeg effect application failed');
      }
    } catch (error) {
      console.error('Effect application failed:', error);
      return {
        success: false,
        error: error.message,
        outputPath: null
      };
    }
  }

  /**
   * 動画をエクスポート
   */
  async exportVideo(
    inputPath: string,
    outputPath: string,
    exportSettings: ExportSettings
  ): Promise<ProcessingResult> {
    const {
      format = 'mp4',
      quality = 'high',
      resolution = '1080p',
      fps = 30
    } = exportSettings;

    // 品質設定
    const qualitySettings = {
      low: { bitrate: '1000k', preset: 'fast' },
      medium: { bitrate: '2000k', preset: 'medium' },
      high: { bitrate: '5000k', preset: 'slow' },
      ultra: { bitrate: '8000k', preset: 'veryslow' }
    };

    const settings = qualitySettings[quality];
    const [width, height] = this.parseResolution(resolution);

    return this.processVideo(inputPath, outputPath, {
      width,
      height,
      bitrate: settings.bitrate,
      fps,
      format,
      codec: format === 'mp4' ? 'libx264' : 'libx265'
    });
  }

  private parseResolution(resolution: string): [number, number] {
    const resolutions: Record<string, [number, number]> = {
      '480p': [854, 480],
      '720p': [1280, 720],
      '1080p': [1920, 1080],
      '1440p': [2560, 1440],
      '4k': [3840, 2160]
    };

    return resolutions[resolution] || [1920, 1080];
  }
}

interface VideoProcessingOptions {
  startTime?: number;
  duration?: number;
  width?: number;
  height?: number;
  bitrate?: string;
  fps?: number;
  format?: string;
  codec?: string;
}

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  format: string;
  size: number;
}

interface VideoEffect {
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'sharpen';
  parameters: Record<string, any>;
}

interface ExportSettings {
  format?: string;
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  resolution?: string;
  fps?: number;
}

interface ProcessingResult {
  success: boolean;
  outputPath?: string | null;
  message?: string;
  error?: string;
  metadata?: any;
}
