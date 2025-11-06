#!/usr/bin/env node

/**
 * Build Optimization Script for Artone Video Editor
 * Analyzes and optimizes build output for production deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BuildOptimizer {
  constructor() {
    this.buildDir = '.next';
    this.reportDir = 'reports';
    this.thresholds = {
      maxBundleSize: 500 * 1024, // 500KB
      maxChunkSize: 100 * 1024, // 100KB
      maxAssetsSize: 2 * 1024 * 1024, // 2MB
      minCompressionRatio: 0.8 // 80%
    };
  }

  async run() {
    console.log('🚀 Starting build optimization analysis...');

    try {
      // Ensure reports directory exists
      if (!fs.existsSync(this.reportDir)) {
        fs.mkdirSync(this.reportDir);
      }

      // Analyze build output
      await this.analyzeBundleSize();
      await this.analyzeAssets();
      await this.checkCompression();
      await this.validateDependencies();
      await this.generateReport();

      console.log('✅ Build optimization analysis completed');
    } catch (error) {
      console.error('❌ Build optimization failed:', error);
      process.exit(1);
    }
  }

  async analyzeBundleSize() {
    console.log('📦 Analyzing bundle sizes...');

    const buildStatsPath = path.join(this.buildDir, 'build-stats.json');

    if (!fs.existsSync(buildStatsPath)) {
      console.log('⚠️  Build stats not found, generating...');
      try {
        execSync('npx next build --dry-run', { stdio: 'inherit' });
      } catch (error) {
        console.log('⚠️  Could not generate build stats');
        return;
      }
    }

    // Analyze bundle composition
    const bundles = this.getBundleSizes();
    const totalSize = bundles.reduce((sum, bundle) => sum + bundle.size, 0);

    console.log(`📊 Total bundle size: ${this.formatBytes(totalSize)}`);
    console.log(`📦 Number of bundles: ${bundles.length}`);

    // Check thresholds
    if (totalSize > this.thresholds.maxBundleSize) {
      console.warn(`⚠️  Bundle size exceeds threshold: ${this.formatBytes(totalSize)} > ${this.formatBytes(this.thresholds.maxBundleSize)}`);
    }

    // Find largest bundles
    const largestBundles = bundles
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);

    console.log('🔍 Largest bundles:');
    largestBundles.forEach(bundle => {
      console.log(`  ${bundle.name}: ${this.formatBytes(bundle.size)}`);
    });

    return { totalSize, bundles };
  }

  async analyzeAssets() {
    console.log('🖼️  Analyzing static assets...');

    const assets = this.getAssetSizes();
    const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);

    console.log(`📊 Total assets size: ${this.formatBytes(totalSize)}`);
    console.log(`🖼️  Number of assets: ${assets.length}`);

    if (totalSize > this.thresholds.maxAssetsSize) {
      console.warn(`⚠️  Assets size exceeds threshold: ${this.formatBytes(totalSize)} > ${this.formatBytes(this.thresholds.maxAssetsSize)}`);
    }

    // Check for large assets
    const largeAssets = assets.filter(asset => asset.size > 100 * 1024); // 100KB

    if (largeAssets.length > 0) {
      console.log('🔍 Large assets (>100KB):');
      largeAssets.forEach(asset => {
        console.log(`  ${asset.name}: ${this.formatBytes(asset.size)}`);
      });
    }

    return { totalSize, assets };
  }

  async checkCompression() {
    console.log('🗜️  Checking compression effectiveness...');

    const assets = this.getAssetSizes();
    let totalOriginal = 0;
    let totalCompressed = 0;

    assets.forEach(asset => {
      if (asset.compressedSize) {
        totalOriginal += asset.originalSize;
        totalCompressed += asset.compressedSize;
      }
    });

    if (totalOriginal > 0) {
      const compressionRatio = totalCompressed / totalOriginal;
      console.log(`📊 Compression ratio: ${(compressionRatio * 100).toFixed(1)}%`);

      if (compressionRatio > this.thresholds.minCompressionRatio) {
        console.log('✅ Compression is effective');
      } else {
        console.warn(`⚠️  Compression ratio below threshold: ${(compressionRatio * 100).toFixed(1)}% < ${this.thresholds.minCompressionRatio * 100}%`);
      }
    }

    return { compressionRatio: totalCompressed / totalOriginal };
  }

  async validateDependencies() {
    console.log('🔍 Validating dependencies...');

    try {
      // Check for security vulnerabilities
      execSync('npm audit --audit-level=moderate', { stdio: 'inherit' });

      // Check for outdated packages
      const outdated = execSync('npm outdated', { encoding: 'utf8' });
      if (outdated.trim()) {
        console.log('📦 Outdated packages found:');
        console.log(outdated);
      } else {
        console.log('✅ All dependencies are up to date');
      }

      // Check bundle analyzer if available
      if (fs.existsSync('.next/analyze')) {
        console.log('✅ Bundle analyzer output available');
      }

    } catch (error) {
      console.warn('⚠️  Dependency validation had issues:', error.message);
    }
  }

  async generateReport() {
    console.log('📋 Generating optimization report...');

    const report = {
      timestamp: new Date().toISOString(),
      buildInfo: await this.getBuildInfo(),
      bundleAnalysis: await this.analyzeBundleSize(),
      assetAnalysis: await this.analyzeAssets(),
      compressionAnalysis: await this.checkCompression(),
      recommendations: this.generateRecommendations()
    };

    const reportPath = path.join(this.reportDir, 'build-optimization-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📋 Report saved to: ${reportPath}`);

    return report;
  }

  getBundleSizes() {
    // This would typically parse the actual Next.js build stats
    // For this example, we'll return mock data
    return [
      { name: 'main', size: 150 * 1024 },
      { name: 'vendor', size: 200 * 1024 },
      { name: 'commons', size: 50 * 1024 },
      { name: 'pages/_app', size: 30 * 1024 },
      { name: 'pages/index', size: 20 * 1024 }
    ];
  }

  getAssetSizes() {
    // Mock asset data
    return [
      { name: 'icon.svg', size: 2 * 1024, compressedSize: 1 * 1024, originalSize: 2 * 1024 },
      { name: 'styles.css', size: 50 * 1024, compressedSize: 15 * 1024, originalSize: 50 * 1024 },
      { name: 'large-image.jpg', size: 500 * 1024, compressedSize: 400 * 1024, originalSize: 500 * 1024 }
    ];
  }

  async getBuildInfo() {
    return {
      nodeVersion: process.version,
      npmVersion: require('npm/package.json').version,
      platform: process.platform,
      arch: process.arch,
      timestamp: Date.now()
    };
  }

  generateRecommendations() {
    const recommendations = [];

    // Add recommendations based on analysis
    recommendations.push({
      type: 'optimization',
      priority: 'medium',
      title: 'Enable gzip compression',
      description: 'Configure server to use gzip compression for text assets'
    });

    recommendations.push({
      type: 'optimization',
      priority: 'low',
      title: 'Implement code splitting',
      description: 'Split large components into separate chunks for better caching'
    });

    recommendations.push({
      type: 'security',
      priority: 'high',
      title: 'Update dependencies',
      description: 'Run npm update to get latest security patches'
    });

    return recommendations;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Run the optimizer
if (require.main === module) {
  const optimizer = new BuildOptimizer();
  optimizer.run().catch(console.error);
}

module.exports = BuildOptimizer;
