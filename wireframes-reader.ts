import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs-extra';
import { join } from 'path';

interface WireframeInfo {
    name: string;
    url: string;
    type: 'image' | 'page' | 'unknown';
    description?: string;
    size?: string;
}

class WireframesReader {
    private baseUrl = 'https://gytx.dev/wareframes/pog_up_wareframes/';
    private outputDir = join(__dirname, 'wireframes-output');
    private visitedUrls = new Set<string>();
    private allWireframes: WireframeInfo[] = [];

    constructor() {
        // Créer le dossier de sortie s'il n'existe pas
        fs.ensureDirSync(this.outputDir);
    }

    /**
     * Explore récursivement toutes les pages et dossiers
     */
    async exploreAllPages(): Promise<WireframeInfo[]> {
        console.log('🚀 Exploration complète du site des wireframes');
        console.log('=' .repeat(50));
        
        // Commencer par la page racine
        await this.explorePage(this.baseUrl);
        
        console.log(`\n📊 Exploration terminée: ${this.allWireframes.length} wireframes trouvés`);
        return this.allWireframes;
    }

    /**
     * Explore une page spécifique et ses liens
     */
    private async explorePage(url: string): Promise<void> {
        if (this.visitedUrls.has(url)) {
            return; // Éviter les boucles infinies
        }
        
        this.visitedUrls.add(url);
        console.log(`🔍 Exploration: ${url}`);

        try {
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });

            if (response.status !== 200) {
                console.log(`⚠️  Erreur HTTP ${response.status} pour ${url}`);
                return;
            }

            // Parser la page actuelle
            const pageWireframes = this.parseWireframes(response.data, url);
            this.allWireframes.push(...pageWireframes);
            
            console.log(`  📱 ${pageWireframes.length} wireframes trouvés sur cette page`);

            // Trouver les liens vers d'autres pages/dossiers
            const linksToExplore = this.findLinksToExplore(response.data, url);
            
            // Explorer chaque lien trouvé
            for (const link of linksToExplore) {
                if (!this.visitedUrls.has(link)) {
                    await this.explorePage(link);
                    // Petite pause pour éviter de surcharger le serveur
                    await this.delay(500);
                }
            }

        } catch (error: any) {
            console.log(`❌ Erreur pour ${url}: ${error.message}`);
        }
    }

    /**
     * Trouve les liens à explorer (dossiers, pages, pagination, etc.)
     */
    private findLinksToExplore(html: string, currentUrl: string): string[] {
        const $ = cheerio.load(html);
        const links: string[] = [];

        // Chercher les liens vers des dossiers ou pages
        $('a[href]').each((index, element) => {
            const href = $(element).attr('href');
            if (!href) return;

            const resolvedUrl = this.resolveUrl(href, currentUrl);
            
            // Ajouter si c'est un dossier ou une page à explorer
            if (this.shouldExploreLink(resolvedUrl, currentUrl)) {
                links.push(resolvedUrl);
            }
        });

        // Chercher spécifiquement la pagination
        const paginationLinks = this.findPaginationLinks($, currentUrl);
        links.push(...paginationLinks);

        return [...new Set(links)]; // Supprimer les doublons
    }

    /**
     * Trouve les liens de pagination (suivant, précédent, numéros de page)
     */
    private findPaginationLinks($: cheerio.CheerioAPI, currentUrl: string): string[] {
        const paginationLinks: string[] = [];

        // Chercher les liens de pagination courants
        const paginationSelectors = [
            'a[href*="page="]',
            'a[href*="p="]',
            'a[href*="offset="]',
            '.pagination a',
            '.pager a',
            '.page-nav a',
            'a:contains("Suivant")',
            'a:contains("Précédent")',
            'a:contains("Next")',
            'a:contains("Previous")',
            'a[href*="&page"]',
            'a[href*="?page"]'
        ];

        paginationSelectors.forEach(selector => {
            $(selector).each((index, element) => {
                const href = $(element).attr('href');
                if (href) {
                    const resolvedUrl = this.resolveUrl(href, currentUrl);
                    if (this.isValidPaginationLink(resolvedUrl, currentUrl)) {
                        paginationLinks.push(resolvedUrl);
                    }
                }
            });
        });

        return paginationLinks;
    }

    /**
     * Vérifie si un lien est une pagination valide
     */
    private isValidPaginationLink(url: string, currentUrl: string): boolean {
        // Vérifier que c'est sur le même domaine
        if (!url.includes('gytx.dev')) {
            return false;
        }

        // Vérifier que ce n'est pas la même page
        if (url === currentUrl) {
            return false;
        }

        // Chercher des patterns de pagination
        const paginationPatterns = [
            /page=\d+/,
            /p=\d+/,
            /offset=\d+/,
            /\/page\/\d+/,
            /\/p\/\d+/
        ];

        return paginationPatterns.some(pattern => pattern.test(url));
    }

    /**
     * Détermine si un lien doit être exploré
     */
    private shouldExploreLink(url: string, currentUrl: string): boolean {
        // Ne pas explorer les liens externes
        if (!url.includes('gytx.dev')) {
            return false;
        }

        // Ne pas explorer les fichiers directs (images, PDFs, etc.)
        const directFileExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.zip', '.rar', '.doc', '.docx', '.txt'];
        if (directFileExtensions.some(ext => url.toLowerCase().includes(ext))) {
            return false;
        }

        // Explorer les dossiers et pages HTML
        return this.isDirectory(url) || this.isWebPage(url);
    }

    /**
     * Vérifie si une URL pointe vers un dossier
     */
    private isDirectory(url: string): boolean {
        // Dossiers typiques
        const directoryPatterns = [
            url.endsWith('/'),
            url.includes('/wareframes/'),
            url.includes('/pog_up_wareframes/'),
            !url.includes('.') && url.includes('/'),
            url.match(/\/([^\/]+)\/$/) // Pattern pour dossiers
        ];

        return directoryPatterns.some(pattern => pattern === true || pattern);
    }

    /**
     * Vérifie si une URL pointe vers une page web
     */
    private isWebPage(url: string): boolean {
        const webPageExtensions = ['.html', '.htm', '.php', '.asp', '.aspx', '.jsp'];
        return webPageExtensions.some(ext => url.toLowerCase().includes(ext));
    }

    /**
     * Pause pour éviter de surcharger le serveur
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Lit et analyse la page des wireframes (méthode originale pour compatibilité)
     */
    async readWireframes(): Promise<WireframeInfo[]> {
        return this.exploreAllPages();
    }

    /**
     * Parse le contenu HTML pour extraire les informations des wireframes
     */
    private parseWireframes(html: string, sourceUrl?: string): WireframeInfo[] {
        const $ = cheerio.load(html);
        const wireframes: WireframeInfo[] = [];

        console.log('🔎 Analyse du contenu HTML...');

        // Rechercher les liens vers des images
        $('a[href*="."]').each((index, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();
            
            if (href && this.isWireframeFile(href)) {
                const wireframe: WireframeInfo = {
                    name: text || this.extractFileName(href),
                    url: this.resolveUrl(href, sourceUrl),
                    type: this.getFileType(href),
                    description: this.extractDescription($(element))
                };
                wireframes.push(wireframe);
            }
        });

        // Rechercher les images directes
        $('img').each((index, element) => {
            const src = $(element).attr('src');
            const alt = $(element).attr('alt') || '';
            
            if (src && this.isWireframeFile(src)) {
                const wireframe: WireframeInfo = {
                    name: alt || this.extractFileName(src),
                    url: this.resolveUrl(src, sourceUrl),
                    type: 'image',
                    description: this.extractDescription($(element))
                };
                wireframes.push(wireframe);
            }
        });

        console.log(`📊 ${wireframes.length} wireframes trouvés`);
        return wireframes;
    }

    /**
     * Vérifie si un fichier est probablement un wireframe
     */
    private isWireframeFile(url: string): boolean {
        const wireframeExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf'];
        const wireframeKeywords = ['wireframe', 'mockup', 'design', 'ui', 'ux', 'screen'];
        
        const lowerUrl = url.toLowerCase();
        
        // Vérifier l'extension
        const hasValidExtension = wireframeExtensions.some(ext => lowerUrl.includes(ext));
        
        // Vérifier les mots-clés
        const hasWireframeKeyword = wireframeKeywords.some(keyword => 
            lowerUrl.includes(keyword) || lowerUrl.includes('pog')
        );
        
        return hasValidExtension || hasWireframeKeyword;
    }

    /**
     * Détermine le type de fichier
     */
    private getFileType(url: string): 'image' | 'page' | 'unknown' {
        const lowerUrl = url.toLowerCase();
        
        if (lowerUrl.includes('.png') || lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || 
            lowerUrl.includes('.gif') || lowerUrl.includes('.svg')) {
            return 'image';
        }
        
        if (lowerUrl.includes('.pdf')) {
            return 'page';
        }
        
        return 'unknown';
    }

    /**
     * Extrait le nom du fichier depuis l'URL
     */
    private extractFileName(url: string): string {
        const parts = url.split('/');
        return parts[parts.length - 1] || 'wireframe';
    }

    /**
     * Extrait une description du contexte de l'élément
     */
    private extractDescription(element: cheerio.Cheerio<any>): string {
        // Chercher dans les éléments parents pour des indices contextuels
        const parentText = element.parent().text().trim();
        const grandParentText = element.parent().parent().text().trim();
        
        return parentText.substring(0, 100) || grandParentText.substring(0, 100) || '';
    }

    /**
     * Résout une URL relative en URL absolue
     */
    private resolveUrl(url: string, baseUrl?: string): string {
        if (url.startsWith('http')) {
            return url;
        }
        
        if (url.startsWith('/')) {
            return `https://gytx.dev${url}`;
        }
        
        // Utiliser l'URL de base fournie ou l'URL par défaut
        const base = baseUrl || this.baseUrl;
        return `${base}${url}`;
    }

    /**
     * Télécharge et sauvegarde un wireframe
     */
    async downloadWireframe(wireframe: WireframeInfo): Promise<string> {
        try {
            console.log(`⬇️  Téléchargement: ${wireframe.name}`);
            
            const response = await axios.get(wireframe.url, {
                responseType: 'stream',
                timeout: 15000
            });

            const fileName = this.sanitizeFileName(wireframe.name);
            const filePath = join(this.outputDir, fileName);
            
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`✅ Sauvegardé: ${fileName}`);
                    resolve(filePath);
                });
                writer.on('error', reject);
            });

        } catch (error: any) {
            console.error(`❌ Erreur téléchargement ${wireframe.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Nettoie le nom de fichier pour éviter les caractères problématiques
     */
    private sanitizeFileName(fileName: string): string {
        return fileName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .toLowerCase();
    }

    /**
     * Génère un rapport des wireframes trouvés
     */
    async generateReport(wireframes: WireframeInfo[]): Promise<void> {
        const reportPath = join(this.outputDir, 'wireframes-report.json');
        const reportData = {
            timestamp: new Date().toISOString(),
            source: this.baseUrl,
            totalWireframes: wireframes.length,
            wireframes: wireframes.map(w => ({
                name: w.name,
                url: w.url,
                type: w.type,
                description: w.description
            }))
        };

        await fs.writeJSON(reportPath, reportData, { spaces: 2 });
        console.log(`📋 Rapport généré: ${reportPath}`);
    }

    /**
     * Fallback: lit des wireframes locaux si la connexion échoue
     */
    private async readLocalWireframes(): Promise<WireframeInfo[]> {
        console.log('🔄 Tentative de lecture des wireframes locaux...');
        
        try {
            const localDir = join(__dirname, 'wireframes');
            if (await fs.pathExists(localDir)) {
                const files = await fs.readdir(localDir);
                return files.map(file => ({
                    name: file,
                    url: join(localDir, file),
                    type: this.getFileType(file)
                }));
            }
        } catch (error) {
            console.log('ℹ️  Aucun wireframe local trouvé');
        }
        
        return [];
    }

    /**
     * Affiche les statistiques d'exploration
     */
    private displayExplorationStats(): void {
        console.log('\n📊 Statistiques d\'exploration:');
        console.log(`  🔍 Pages visitées: ${this.visitedUrls.size}`);
        console.log(`  📱 Wireframes trouvés: ${this.allWireframes.length}`);
        
        // Grouper par type
        const types = this.allWireframes.reduce((acc, wf) => {
            acc[wf.type] = (acc[wf.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        Object.entries(types).forEach(([type, count]) => {
            console.log(`    ${type}: ${count}`);
        });
        
        console.log('');
    }

    /**
     * Affiche la liste des wireframes trouvés
     */
    private displayWireframes(wireframes: WireframeInfo[]): void {
        console.log('\n📱 Wireframes Pog\'Up trouvés:');
        console.log('=' .repeat(60));
        
        wireframes.forEach((wf, index) => {
            console.log(`${index + 1}. ${wf.name} (${wf.type})`);
            console.log(`   🔗 URL: ${wf.url}`);
            if (wf.description) {
                console.log(`   📄 Description: ${wf.description.substring(0, 80)}...`);
            }
            console.log('');
        });
    }

    /**
     * Méthode principale pour exécuter la lecture complète
     */
    async run(): Promise<void> {
        console.log('🚀 Démarrage du lecteur de wireframes Pog\'Up');
        console.log('=' .repeat(50));

        try {
            // 1. Explorer toutes les pages
            const wireframes = await this.exploreAllPages();

            if (wireframes.length === 0) {
                console.log('⚠️  Aucun wireframe trouvé');
                return;
            }

            // 2. Afficher les statistiques
            this.displayExplorationStats();

            // 3. Afficher la liste
            this.displayWireframes(wireframes);

            // 4. Télécharger les wireframes (optionnel)
            console.log('⬇️  Téléchargement des wireframes...');
            const downloadPromises = wireframes.map(wf => this.downloadWireframe(wf));
            const results = await Promise.allSettled(downloadPromises);
            
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            console.log(`✅ Téléchargements réussis: ${successful}`);
            if (failed > 0) {
                console.log(`❌ Téléchargements échoués: ${failed}`);
            }

            // 5. Générer le rapport
            await this.generateReport(wireframes);

            console.log('\n✅ Processus terminé avec succès!');
            console.log(`📁 Fichiers sauvegardés dans: ${this.outputDir}`);

        } catch (error: any) {
            console.error('\n❌ Erreur lors de l\'exécution:', error.message);
            process.exit(1);
        }
    }
}

// Exécution du script
if (require.main === module) {
    const reader = new WireframesReader();
    reader.run().catch(console.error);
}

export default WireframesReader;
