'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './report.module.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TableRow, TableColumn } from '@/app/types/tables';
import type { SummaryTable } from '@/app/types/csv';
import { generateSummaryTables, generateMultiFileSummaryTables, generateSummaryTablesEnhanced, generateMultiFileSummaryTablesEnhanced, type ReportData } from '@/app/services/summaryTableService';
import { buildApiUrl } from '../../../../utils/apiConfig';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ReportPageProps {
  params: {
    id: string;
    report_id: string;
  };
}

interface TabItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  tableRefs: string[];
}

interface WorkspaceData {
  _id: string;
  name: string;
  datasets?: Array<{
    id: string;
    name: string;
    versions: Array<{
      id: string;
      content: string;
      fileName: string;
      type: 'csv' | 'excel';
      createdAt: string;
    }>;
  }>;
}

interface DetailedTableAnalysis {
  businessContext: string;
  keyTrends: string[];
  financialImplications: string;
  riskFactors: string[];
  opportunities: string[];
  recommendations: string[];
  industryBenchmark: string;
  forecastInsights: string;
}

interface EnhancedReportData extends ReportData {
  detailedAnalysis?: {
    [tableId: string]: DetailedTableAnalysis;
  };
}

const ReportPage: React.FC<ReportPageProps> = ({ params }) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [reportData, setReportData] = useState<EnhancedReportData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reportName, setReportName] = useState<string>('Financial Report');
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Function to generate detailed analysis for a table
  const generateDetailedTableAnalysis = async (
    table: SummaryTable,
    csvContent: string,
    fileName: string
  ): Promise<DetailedTableAnalysis> => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error('Gemini API key is not configured');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // Convert table data to a readable format for analysis
      const tableDataString = table.data.map(row => 
        Object.entries(row)
          .filter(([key]) => key !== 'isTotal' && key !== 'isSubTotal' && key !== 'isHeader')
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
      ).join('\n');

      const prompt = `
You are a senior financial analyst preparing a detailed analysis for a financial table in an annual report. Analyze the following financial table and provide comprehensive insights.

TABLE INFORMATION:
Title: ${table.title}
Description: ${table.description}
Columns: ${table.columns.map(col => col.header).join(', ')}

TABLE DATA:
${tableDataString}

ORIGINAL CSV DATA:
${csvContent}

FILE NAME: ${fileName}

Please provide a detailed financial analysis with the following sections:

1. BUSINESS CONTEXT: Explain what this table represents in the context of financial reporting and business operations. Use professional financial terminology.

2. KEY TRENDS: Identify 3-5 important trends or patterns in the data. Focus on significant changes, growth patterns, or anomalies.

3. FINANCIAL IMPLICATIONS: Explain what this data means for the business's financial health, performance, and strategic position.

4. RISK FACTORS: Identify 2-4 potential risks or concerns based on this data analysis.

5. OPPORTUNITIES: Identify 2-4 potential opportunities or positive indicators from this data.

6. RECOMMENDATIONS: Provide 3-5 specific, actionable recommendations based on this analysis.

7. INDUSTRY BENCHMARK: Compare this data to industry standards or benchmarks where applicable.

8. FORECAST INSIGHTS: Provide forward-looking insights and projections based on the current data trends.

CRITICAL FORMATTING REQUIREMENTS:
- Write in PLAIN TEXT only - no markdown, no formatting symbols
- NEVER use asterisks (*) or any special characters for emphasis
- NEVER use double asterisks (**) for bold text
- Use only regular sentences and paragraphs
- For lists, use simple numbered points or write as sentences
- Write professionally without any formatting markup

Format your response exactly as follows (use plain text only):

BUSINESS CONTEXT:
Write your business context analysis here in plain sentences without any formatting symbols.

KEY TRENDS:
Write trend 1 as a complete sentence.
Write trend 2 as a complete sentence.
Write trend 3 as a complete sentence.

FINANCIAL IMPLICATIONS:
Write your financial implications analysis here in plain sentences without any formatting symbols.

RISK FACTORS:
Write risk 1 as a complete sentence.
Write risk 2 as a complete sentence.

OPPORTUNITIES:
Write opportunity 1 as a complete sentence.
Write opportunity 2 as a complete sentence.

RECOMMENDATIONS:
Write recommendation 1 as a complete sentence.
Write recommendation 2 as a complete sentence.
Write recommendation 3 as a complete sentence.

INDUSTRY BENCHMARK:
Write your industry benchmark analysis here in plain sentences without any formatting symbols.

FORECAST INSIGHTS:
Write your forecast insights here in plain sentences without any formatting symbols.

Remember: Use ONLY plain text. NO asterisks, NO bold formatting, NO markdown. Write as if you are writing a formal business document.
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the response to extract different sections
      const businessContextMatch = text.match(/BUSINESS CONTEXT:([\s\S]*?)(?=KEY TRENDS:|$)/i);
      const keyTrendsMatch = text.match(/KEY TRENDS:([\s\S]*?)(?=FINANCIAL IMPLICATIONS:|$)/i);
      const financialImplicationsMatch = text.match(/FINANCIAL IMPLICATIONS:([\s\S]*?)(?=RISK FACTORS:|$)/i);
      const riskFactorsMatch = text.match(/RISK FACTORS:([\s\S]*?)(?=OPPORTUNITIES:|$)/i);
      const opportunitiesMatch = text.match(/OPPORTUNITIES:([\s\S]*?)(?=RECOMMENDATIONS:|$)/i);
      const recommendationsMatch = text.match(/RECOMMENDATIONS:([\s\S]*?)(?=INDUSTRY BENCHMARK:|$)/i);
      const industryBenchmarkMatch = text.match(/INDUSTRY BENCHMARK:([\s\S]*?)(?=FORECAST INSIGHTS:|$)/i);
      const forecastInsightsMatch = text.match(/FORECAST INSIGHTS:([\s\S]*?)(?=$)/i);

      // Helper function to clean text content
      const cleanText = (text: string): string => {
        return text
          .replace(/\*+/g, '') // Remove all asterisks
          .replace(/#+\s*/g, '') // Remove markdown headers
          .replace(/\*\*/g, '') // Remove bold markdown
          .replace(/\*/g, '') // Remove italic markdown
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/^\s*[-•]\s*/, '') // Remove leading bullet points
          .trim();
      };

      const businessContext = businessContextMatch ? 
        cleanText(businessContextMatch[1]) : 
        'This table provides important financial metrics for business analysis.';
      
      const keyTrends = keyTrendsMatch ? 
        keyTrendsMatch[1]
          .split(/\n/)
          .map(item => cleanText(item))
          .filter(item => item.length > 0 && !item.toLowerCase().includes('trend') && !item.toLowerCase().includes('write'))
          .slice(0, 5) : 
        ['Data analysis reveals important patterns and trends.'];
      
      const financialImplications = financialImplicationsMatch ? 
        cleanText(financialImplicationsMatch[1]) : 
        'The data indicates important financial implications for business strategy.';
      
      const riskFactors = riskFactorsMatch ? 
        riskFactorsMatch[1]
          .split(/\n/)
          .map(item => cleanText(item))
          .filter(item => item.length > 0 && !item.toLowerCase().includes('risk') && !item.toLowerCase().includes('write'))
          .slice(0, 4) : 
        ['Consider potential risks in financial planning.'];
      
      const opportunities = opportunitiesMatch ? 
        opportunitiesMatch[1]
          .split(/\n/)
          .map(item => cleanText(item))
          .filter(item => item.length > 0 && !item.toLowerCase().includes('opportunity') && !item.toLowerCase().includes('write'))
          .slice(0, 4) : 
        ['Identify growth opportunities in the data.'];
      
      const recommendations = recommendationsMatch ? 
        recommendationsMatch[1]
          .split(/\n/)
          .map(item => cleanText(item))
          .filter(item => item.length > 0 && !item.toLowerCase().includes('recommendation') && !item.toLowerCase().includes('write'))
          .slice(0, 5) : 
        ['Develop strategic recommendations based on analysis.'];
      
      const industryBenchmark = industryBenchmarkMatch ? 
        cleanText(industryBenchmarkMatch[1]) : 
        'Compare performance against industry standards and benchmarks.';
      
      const forecastInsights = forecastInsightsMatch ? 
        cleanText(forecastInsightsMatch[1]) : 
        'Project future trends and performance based on current data.';

      return {
        businessContext,
        keyTrends,
        financialImplications,
        riskFactors,
        opportunities,
        recommendations,
        industryBenchmark,
        forecastInsights
      };
    } catch (error: any) {
      console.error('Error generating detailed table analysis:', error);
      return {
        businessContext: 'This table provides important financial metrics for business analysis.',
        keyTrends: ['Data analysis reveals important patterns and trends.'],
        financialImplications: 'The data indicates important financial implications for business strategy.',
        riskFactors: ['Consider potential risks in financial planning.'],
        opportunities: ['Identify growth opportunities in the data.'],
        recommendations: ['Develop strategic recommendations based on analysis.'],
        industryBenchmark: 'Compare performance against industry standards and benchmarks.',
        forecastInsights: 'Project future trends and performance based on current data.'
      };
    }
  };

  // Load data on mount
  useEffect(() => {
    const loadReportData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Check authentication
        const token = localStorage.getItem('token');
        if (!token) {
          router.push('/login');
          return;
        }

        // Fetch workspace data to get datasets
        const response = await fetch(buildApiUrl(`api/workspaces/${params.id}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch workspace data');
        }

        const { data: workspace } = await response.json();
        setWorkspaceData(workspace);
        setReportName(`${workspace.name} - Financial Report`);

        // REPORT PERSISTENCE LOGIC:
        // 1. First check if a report already exists for this report_id
        // 2. If exists, use the saved report data (maintains consistency)
        // 3. If not exists, generate new report using session data or current dataset versions
        // 4. Save the new report with dataset version information for future consistency
        
        // First, try to fetch existing report data for this specific report_id
        let existingReportData: EnhancedReportData | null = null;
        let sessionData: any = null;
        
        try {
          const token = localStorage.getItem('token');
          const reportResponse = await fetch(buildApiUrl(`api/workspaces/${params.id}/report/${params.report_id}`), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          
          if (reportResponse.ok) {
            const { data: reportData } = await reportResponse.json();
            if (reportData) {
              // Check if this is already processed report data
              if (reportData.reportData) {
                existingReportData = reportData.reportData;
                setReportData(existingReportData);
                setIsLoading(false);
                return; // Use existing report data, no need to regenerate
              }
              
              // This is session data that needs to be processed
              sessionData = reportData;
            }
          }
        } catch (fetchError) {
          console.log('No existing report found, will generate new one using workspace data');
        }

        let csvFiles: { content: string; fileName: string }[] = [];
        let useSessionDataOnly = false;

        // Use session data if available, otherwise fall back to workspace datasets
        if (sessionData) {
          console.log('[Report] Session data found:', {
            hasUploadedFiles: !!sessionData.uploadedFiles,
            isFromSavedInsight: !!sessionData.isFromSavedInsight,
            uploadedFilesCount: sessionData.uploadedFiles ? sessionData.uploadedFiles.length : 0
          });

          if (sessionData.isFromSavedInsight && sessionData.savedInsightData) {
            // This report is generated from a saved insight - we don't have the raw CSV data
            // We'll need to create a simplified report based on the insight data
            const savedInsight = sessionData.savedInsightData;
            
            // Create a simplified report data structure
            const simplifiedReportData: EnhancedReportData = {
              summary: savedInsight.summary,
              insights: Array.isArray(savedInsight.insights) ? savedInsight.insights : [savedInsight.insights],
              recommendations: Array.isArray(savedInsight.recommendations) ? savedInsight.recommendations : [savedInsight.recommendations],
              tables: [], // No tables for saved insights
              detailedAnalysis: {}
            };
            
            setReportData(simplifiedReportData);
            setIsLoading(false);
            return;
          } else if (sessionData.uploadedFiles && sessionData.uploadedFiles.length > 0) {
            // Use the uploaded files from the current session
            csvFiles = sessionData.uploadedFiles;
            useSessionDataOnly = true;
            console.log('[Report] Using session uploaded files:', csvFiles.length, 'files');
            console.log('[Report] Session files details:', csvFiles.map(f => ({ 
              fileName: f.fileName, 
              contentLength: f.content.length,
              contentPreview: f.content.substring(0, 100) + '...'
            })));
          } else {
            console.warn('[Report] Session data exists but no uploadedFiles found:', sessionData);
          }
        }
        
        // Fall back to workspace datasets ONLY if no session data is available
        if (!useSessionDataOnly && csvFiles.length === 0) {
          console.log('[Report] No session data found, falling back to workspace datasets');
          
          // Check if workspace has datasets with data
          if (!workspace.datasets || workspace.datasets.length === 0) {
            setError('No datasets found in this workspace. Please upload financial data first.');
            return;
          }

          // Get the latest version of each dataset (snapshot at report creation time)
          const currentDatasets = workspace.datasets.map((dataset: any) => {
            const latestVersion = dataset.versions[dataset.versions.length - 1];
            return {
              content: latestVersion.content,
              fileName: latestVersion.fileName,
              type: latestVersion.type,
              datasetId: dataset.id,
              versionId: latestVersion.id,
              createdAt: latestVersion.createdAt
            };
          });

          // Process content (keep Excel data as JSON, CSV as text)
          csvFiles = currentDatasets.map((dataset: any) => {
            return {
              content: dataset.content, // Keep original content format
              fileName: dataset.fileName,
              type: dataset.type // Pass the type information
            };
          });
        } else {
          // Keep original content format for session files
          csvFiles = csvFiles.map((dataset: any) => {
            return {
              content: dataset.content, // Keep original content (Excel as JSON, CSV as text)
              fileName: dataset.fileName,
              type: dataset.type // Preserve type information if available
            };
          });
        }        
        // Check if we have any data to process
        if (csvFiles.length === 0) {
          console.error('[Report] No data available to generate report');
          
          if (useSessionDataOnly) {
            setError('No session data available to generate this report. Please upload files first and try generating the report again.');
          } else {
            setError('No data available to generate this report. The session data may have been lost or expired.');
          }
          setIsLoading(false);
          return;
        }

        // Final validation: If we're supposed to use session data only, make sure we don't accidentally use workspace data
        if (useSessionDataOnly && sessionData && sessionData.uploadedFiles) {
          console.log('[Report] FINAL CHECK: Using ONLY session data, ignoring any workspace datasets');
        } else if (!useSessionDataOnly) {
          console.log('[Report] FINAL CHECK: No session data available, using workspace datasets as fallback');
        }

        console.log('[Report] Processing data with', csvFiles.length, 'files:', 
          csvFiles.map(f => ({ fileName: f.fileName, contentLength: f.content.length })));

        // Generate summary tables using enhanced Gemini AI functions
        let reportData: ReportData;
        
        if (csvFiles.length === 1) {
          // Use enhanced function that detects file type (CSV vs Excel with multiple sheets)
          reportData = await generateSummaryTablesEnhanced(csvFiles[0].content, csvFiles[0].fileName);
        } else {
          // Use enhanced multi-file function that handles mixed CSV and Excel files
          reportData = await generateMultiFileSummaryTablesEnhanced(csvFiles);
        }
        
        // Generate detailed analysis for each table
        const detailedAnalysis: { [tableId: string]: DetailedTableAnalysis } = {};
        
        try {
          // Generate detailed analysis for each table
          for (const table of reportData.tables) {
            const csvContent = csvFiles.length === 1 ? csvFiles[0].content : csvFiles.map((f: { content: string; fileName: string }) => f.content).join('\n\n');
            const fileName = csvFiles.length === 1 ? csvFiles[0].fileName : 'Multiple Files';
            
            detailedAnalysis[table.id] = await generateDetailedTableAnalysis(table, csvContent, fileName);
          }
        } catch (analysisError) {
          console.error('Error generating detailed analysis:', analysisError);
          // Continue without detailed analysis if there's an error
        }
        
        // Combine the basic report data with detailed analysis
        const enhancedReportData: EnhancedReportData = {
          ...reportData,
          detailedAnalysis
        };
        
        setReportData(enhancedReportData);
        
        // Set the first available tab as active if not already set to overview
        if (activeTab !== 'overview' && reportData.tables.length > 0) {
          setActiveTab('overview');
        }

        // Save the generated report data to the server for future access
        try {
          const token = localStorage.getItem('token');
          await fetch(buildApiUrl(`api/workspaces/${params.id}/report/${params.report_id}`), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              data: {
                reportData: enhancedReportData,
                generatedAt: new Date().toISOString(),
                workspaceName: workspace.name,
                sessionInfo: sessionData ? {
                  usedSessionData: true,
                  sessionDataType: sessionData.isFromSavedInsight ? 'savedInsight' : 'uploadedFiles',
                  fileCount: sessionData.uploadedFiles ? sessionData.uploadedFiles.length : 1
                } : {
                  usedSessionData: false,
                  sessionDataType: 'workspaceDatasets',
                  fileCount: csvFiles.length
                }
              }
            })
          });
        } catch (saveError) {
          console.warn('Failed to save report data:', saveError);
          // Don't throw error as this is optional
        }

      } catch (err: any) {
        console.error('Error loading report data:', err);
        setError(err.message || 'Failed to load report data');
      } finally {
        setIsLoading(false);
      }
    };

    loadReportData();
  }, [params.id, params.report_id, router]);

  // Define sidebar tabs based on available summary tables
  const tabs: TabItem[] = [
    {
      id: 'overview',
      title: 'Overview',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.tabIcon}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1.5 1.5m7.5-1.5l1.5 1.5m-7.5 0V21m7.5 0V21" />
        </svg>
      ),
      tableRefs: []
    }
  ];

  // Add dynamic tabs based on available tables
  if (reportData?.tables) {
    reportData.tables.forEach((table, index) => {
      tabs.push({
        id: table.id,
        title: table.title,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.tabIcon}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 0A2.25 2.25 0 015.625 3.375h13.5A2.25 2.25 0 0121.375 5.625m0 0v12.75m-9.75-1.125h7.5c.621 0 1.125-.504 1.125-1.125M12 7.5h8.25m-8.25 0a2.25 2.25 0 00-2.25 2.25V12m0 0v2.25a2.25 2.25 0 002.25 2.25M12 7.5V12m8.25-4.5V12m0 0v2.25a2.25 2.25 0 01-2.25 2.25H12m8.25-4.5a2.25 2.25 0 00-2.25-2.25H12m0 0V7.5" />
          </svg>
        ),
        tableRefs: [table.id]
      });
    });
  }

  // Function to filter tables based on active tab
  const getVisibleTables = (): SummaryTable[] => {
    if (activeTab === 'overview') {
      return reportData?.tables || [];
    }
    
    const activeTabItem = tabs.find(tab => tab.id === activeTab);
    if (!activeTabItem || !reportData?.tables) return [];
    
    return reportData.tables.filter(table => 
      activeTabItem.tableRefs.includes(table.id)
    );
  };
  
  // Function to format currency numbers
  const formatCurrency = (value: number | null): string => {
    if (value === null) return '';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  // Function to format numbers
  const formatNumber = (value: any): string => {
    if (value === null) return '';
    if (typeof value === 'string' && value.includes('%')) return value;
    return new Intl.NumberFormat('en-IN').format(Number(value));
  };
  
  // Function to determine cell class based on value
  const getCellClass = (value: string | number | boolean | null | undefined, isNumeric: boolean = false): string => {
    if (value === null || value === undefined) return '';
    let classes = isNumeric ? styles.number : '';
    
    if (typeof value === 'number') {
      if (value > 0) classes += ' ' + styles.positive;
      else if (value < 0) classes += ' ' + styles.negative;
      else classes += ' ' + styles.neutral;
    }
    
    return classes;
  };

  // Function to get row class based on row type
  const getRowClass = (row: TableRow): string => {
    if (row.isTotal) return styles.total;
    if (row.isSubTotal) return styles.total;
    if (row.isHeader) return styles.total;
    return '';
  };
  // Function to export the report as PDF with professional structure
  const exportToPdf = async () => {
    if (!reportData || !workspaceData) {
      toast.error('Report data not available for export');
      return;
    }
    
    setIsExportingPdf(true);
    
    try {
      toast.info('Generating professional PDF report...');
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (2 * margin);
    const footerY = pageHeight - 15;
    
    // Set document properties
    doc.setProperties({
      title: `${reportName} - Financial Report`,
      subject: 'Comprehensive Financial Analysis Report',
      author: 'Finaxial',
      creator: 'Finaxial Application',
      keywords: 'financial, analysis, report'
    });
    
    // PAGE 1: TITLE PAGE
    // Add Finaxial logo and title page
    doc.setFontSize(24);
    doc.setTextColor(102, 126, 234); // Brand blue color
    doc.setFont('helvetica', 'bold');
    
    // Add actual Finaxial logo
    try {
      // Create an image element to load the logo
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      
      // Use a promise to handle logo loading
      await new Promise((resolve, reject) => {
        logoImg.onload = () => {
          try {
            // Add logo to PDF (centered, with appropriate size)
            const logoWidth = 40;
            const logoHeight = 20;
            const logoX = (pageWidth - logoWidth) / 2;
            const logoY = 40;
            
            doc.addImage(logoImg, 'PNG', logoX, logoY, logoWidth, logoHeight);
            resolve(true);
          } catch (error) {
            console.error('Error adding logo to PDF:', error);
            // Fallback to text logo if image fails
            doc.setFillColor(102, 126, 234);
            doc.circle(pageWidth / 2, 60, 15, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20);
            doc.text('F', pageWidth / 2, 65, { align: 'center' });
            resolve(true);
          }
        };
        
        logoImg.onerror = () => {
          console.error('Failed to load logo image');
          // Fallback to text logo
          doc.setFillColor(102, 126, 234);
          doc.circle(pageWidth / 2, 60, 15, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(20);
          doc.text('F', pageWidth / 2, 65, { align: 'center' });
          resolve(true);
        };
        
        // Load the logo from public folder
        logoImg.src = '/finaxial-logooo.png';
      });
    } catch (error) {
      console.error('Error loading logo:', error);
      // Fallback to simple circle logo
      doc.setFillColor(102, 126, 234);
      doc.circle(pageWidth / 2, 60, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text('F', pageWidth / 2, 65, { align: 'center' });
    }
    
    // Company name
    doc.setTextColor(102, 126, 234);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('FINAXIAL', pageWidth / 2, 95, { align: 'center' });
    
    // Report title
    doc.setTextColor(45, 55, 72);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'normal');
    doc.text('FINANCIAL ANALYSIS REPORT', pageWidth / 2, 120, { align: 'center' });
    
    // Workspace name
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(workspaceData.name || 'Financial Workspace', pageWidth / 2, 140, { align: 'center' });
    
    // Generated date
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated on: ${reportDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}`, pageWidth / 2, 160, { align: 'center' });
    
    // Add decorative line
    doc.setLineWidth(0.5);
    doc.setDrawColor(102, 126, 234);
    doc.line(margin, 180, pageWidth - margin, 180);
    
    // Add professional note
    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    const note = 'This report contains confidential financial analysis and should be treated as proprietary information.';
    const noteLines = doc.splitTextToSize(note, contentWidth - 40);
    doc.text(noteLines, pageWidth / 2, 210, { align: 'center' });
    
    // PAGE 2: TABLE OF CONTENTS
    doc.addPage();
    
    // TOC Title
    doc.setFontSize(24);
    doc.setTextColor(45, 55, 72);
    doc.setFont('helvetica', 'bold');
    doc.text('TABLE OF CONTENTS', margin, 40);
    
    // Add underline
    doc.setLineWidth(0.5);
    doc.setDrawColor(102, 126, 234);
    doc.line(margin, 45, pageWidth - margin, 45);
    
    let tocY = 65;
    let currentPage = 3; // Starting from page 3
    
    // TOC entries
    const tocEntries = [
      { title: 'Executive Summary', page: currentPage },
      { title: 'Financial Tables Analysis', page: currentPage + 1 },
    ];
    
    // Add table entries to TOC
    reportData.tables.forEach((table, index) => {
      tocEntries.push({
        title: `${index + 1}. ${table.title}`,
        page: currentPage + 1 + index
      });
    });
    
    // Add comprehensive analysis to TOC
    tocEntries.push({
      title: 'Comprehensive Financial Analysis',
      page: currentPage + 1 + reportData.tables.length
    });
    
    // Render TOC entries
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(45, 55, 72);
    
    tocEntries.forEach((entry, index) => {
      const yPos = tocY + (index * 8);
      
      // Entry title
      doc.text(entry.title, margin, yPos);
      
      // Dotted line
      const titleWidth = doc.getTextWidth(entry.title);
      const pageNumWidth = doc.getTextWidth(entry.page.toString());
      const dotsWidth = contentWidth - titleWidth - pageNumWidth - 10;
      const dotCount = Math.floor(dotsWidth / 3);
      const dots = '.'.repeat(dotCount);
      
      doc.setTextColor(156, 163, 175);
      doc.text(dots, margin + titleWidth + 5, yPos);
      
      // Page number
      doc.setTextColor(45, 55, 72);
      doc.text(entry.page.toString(), pageWidth - margin, yPos, { align: 'right' });
    });
    
    // PAGE 3: EXECUTIVE SUMMARY
    doc.addPage();
    
    doc.setFontSize(20);
    doc.setTextColor(45, 55, 72);
    doc.setFont('helvetica', 'bold');
    doc.text('EXECUTIVE SUMMARY', margin, 40);
    
    doc.setLineWidth(0.5);
    doc.setDrawColor(102, 126, 234);
    doc.line(margin, 45, pageWidth - margin, 45);
    
    if (reportData.summary) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(75, 85, 99);
      const summaryLines = doc.splitTextToSize(reportData.summary, contentWidth);
      doc.text(summaryLines, margin, 60);
    }
    
    // Add insights section
    let insightY = 135; // Declare variable outside the if block
    if (reportData.insights && reportData.insights.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(45, 55, 72);
      doc.text('Key Insights', margin, 120);
      
      insightY = 135;
      reportData.insights.forEach((insight, index) => {
        // Check if we need a new page
        if (insightY > pageHeight - 60) {
          doc.addPage();
          insightY = 40;
        }
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(75, 85, 99);
        
        // Properly wrap text within margins
        const bulletPoint = `• ${insight}`;
        const wrappedLines = doc.splitTextToSize(bulletPoint, contentWidth - 10);
        doc.text(wrappedLines, margin + 5, insightY);
        insightY += wrappedLines.length * 5 + 3; // Add spacing between insights
      });
    }
    
    // Add recommendations section
    if (reportData.recommendations && reportData.recommendations.length > 0) {
      // Check if we need a new page for recommendations
      if (insightY > pageHeight - 80) {
        doc.addPage();
        insightY = 40;
      }
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(45, 55, 72);
      doc.text('Strategic Recommendations', margin, insightY + 15);
      
      let recY = insightY + 30;
      reportData.recommendations.forEach((rec, index) => {
        // Check if we need a new page
        if (recY > pageHeight - 60) {
          doc.addPage();
          recY = 40;
        }
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(75, 85, 99);
        
        // Properly wrap text within margins
        const bulletPoint = `• ${rec}`;
        const wrappedLines = doc.splitTextToSize(bulletPoint, contentWidth - 10);
        doc.text(wrappedLines, margin + 5, recY);
        recY += wrappedLines.length * 5 + 3; // Add spacing between recommendations
      });
    }
    
    // PAGES 4+: FINANCIAL TABLES WITH DETAILED ANALYSIS
    reportData.tables.forEach((table, tableIndex) => {
      doc.addPage(); // Each table starts on a new page
      
      // Table title
      doc.setFontSize(18);
      doc.setTextColor(45, 55, 72);
      doc.setFont('helvetica', 'bold');
      doc.text(table.title, margin, 40);
      
      // Table description
      if (table.description) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        const descLines = doc.splitTextToSize(table.description, contentWidth);
        doc.text(descLines, margin, 50);
      }
      
      // Prepare table data for autoTable
      const tableData = table.data.map(row => 
        table.columns.map(col => {
          const value = row[col.accessor];
          if (col.isCurrency && typeof value === 'number') {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(value);
          }
          if (col.isNumeric && typeof value === 'number') {
            return new Intl.NumberFormat('en-US').format(value);
          }
          return value?.toString() || '';
        })
      );
      
      const tableHeaders = table.columns.map(col => col.header);
      
      // Generate table using autoTable
      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: 70,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 9,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [102, 126, 234],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        tableLineColor: [229, 231, 235],
        tableLineWidth: 0.1,
      });
      
      // Add detailed analysis if available
      const detailedAnalysis = reportData.detailedAnalysis?.[table.id];
      if (detailedAnalysis) {
        const finalY = (doc as any).lastAutoTable?.finalY || 120;
        let analysisY = finalY + 20;
        
        // Check if we need a new page for analysis
        if (analysisY > pageHeight - 80) {
          doc.addPage();
          analysisY = 40;
        }
        
        // Analysis title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(45, 55, 72);
        doc.text('Detailed Analysis', margin, analysisY);
        
        analysisY += 15;
        
        // Business Context
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(102, 126, 234);
        doc.text('Business Context', margin, analysisY);
        
        analysisY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(75, 85, 99);
        const contextLines = doc.splitTextToSize(detailedAnalysis.businessContext, contentWidth);
        doc.text(contextLines, margin, analysisY);
        analysisY += contextLines.length * 4 + 8;
        
        // Financial Implications
        if (analysisY > pageHeight - 50) {
          doc.addPage();
          analysisY = 40;
        }
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(102, 126, 234);
        doc.text('Financial Implications', margin, analysisY);
        
        analysisY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(75, 85, 99);
        const implLines = doc.splitTextToSize(detailedAnalysis.financialImplications, contentWidth);
        doc.text(implLines, margin, analysisY);
        analysisY += implLines.length * 4 + 8;
        
        // Industry Benchmark
        if (analysisY > pageHeight - 50) {
          doc.addPage();
          analysisY = 40;
        }
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(102, 126, 234);
        doc.text('Industry Benchmark', margin, analysisY);
        
        analysisY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(75, 85, 99);
        const benchLines = doc.splitTextToSize(detailedAnalysis.industryBenchmark, contentWidth);
        doc.text(benchLines, margin, analysisY);
        analysisY += benchLines.length * 4 + 8;
        
        // Risk Factors
        if (detailedAnalysis.riskFactors && detailedAnalysis.riskFactors.length > 0) {
          if (analysisY > pageHeight - 50) {
            doc.addPage();
            analysisY = 40;
          }
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(220, 53, 69);
          doc.text('Risk Factors', margin, analysisY);
          
          analysisY += 8;
          detailedAnalysis.riskFactors.forEach((risk, index) => {
            // Check if we need a new page before adding risk factor
            if (analysisY > pageHeight - 40) {
              doc.addPage();
              analysisY = 40;
            }
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(75, 85, 99);
            
            // Properly wrap risk factor text within margins
            const bulletPoint = `• ${risk}`;
            const wrappedRiskLines = doc.splitTextToSize(bulletPoint, contentWidth - 10);
            doc.text(wrappedRiskLines, margin + 5, analysisY);
            analysisY += wrappedRiskLines.length * 5 + 2; // Add proper spacing
          });
        }
      }
    });
    
    // FINAL PAGE: COMPREHENSIVE FINANCIAL ANALYSIS SUMMARY
    doc.addPage();
    
    doc.setFontSize(20);
    doc.setTextColor(45, 55, 72);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPREHENSIVE FINANCIAL ANALYSIS', margin, 40);
    
    doc.setLineWidth(0.5);
    doc.setDrawColor(102, 126, 234);
    doc.line(margin, 45, pageWidth - margin, 45);
    
    let summaryY = 65;
    
    // Overall business context summary
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text('Overall Assessment', margin, summaryY);
    
    summaryY += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    
    const overallSummary = `This comprehensive financial analysis encompasses ${reportData.tables.length} key financial areas, ` +
      `providing detailed insights into business performance, financial health, and strategic positioning. ` +
      `The analysis considers industry benchmarks, identifies key risk factors, and provides actionable recommendations ` +
      `for enhanced financial performance and strategic decision-making.`;
    
    const summaryLines = doc.splitTextToSize(overallSummary, contentWidth);
    doc.text(summaryLines, margin, summaryY);
    summaryY += summaryLines.length * 4 + 15;
    
    // Key findings
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text('Key Findings', margin, summaryY);
    
    summaryY += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    
    const keyFindings = [
      `Analyzed ${reportData.tables.length} comprehensive financial datasets`,
      'Identified strategic opportunities for performance improvement',
      'Assessed financial health against industry benchmarks',
      'Highlighted critical risk factors requiring attention',
      'Provided actionable recommendations for strategic implementation'
    ];
    
    keyFindings.forEach(finding => {
      // Check if we need a new page
      if (summaryY > pageHeight - 40) {
        doc.addPage();
        summaryY = 40;
      }
      
      // Properly wrap finding text within margins
      const bulletPoint = `• ${finding}`;
      const wrappedFindingLines = doc.splitTextToSize(bulletPoint, contentWidth - 10);
      doc.text(wrappedFindingLines, margin + 5, summaryY);
      summaryY += wrappedFindingLines.length * 5 + 2; // Add proper spacing
    });
    
    // Add footer with page numbers to all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      // Footer line
      doc.setLineWidth(0.3);
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      
      // Footer text
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(156, 163, 175);
      
      if (i === 1) {
        // Title page - no page number
        doc.text('Finaxial Financial Analysis Report', pageWidth / 2, footerY, { align: 'center' });
      } else {
        doc.text('Finaxial Financial Analysis Report', margin, footerY);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
      }
    }
    
    // Save the PDF
    doc.save(`${workspaceData.name || 'Financial'}-Report-${new Date().toISOString().split('T')[0]}.pdf`);
    
    toast.success('Professional PDF report generated successfully!');
    
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF report. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className={styles.reportContainer}>
      <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} />
      
      <div className={styles.reportLayout}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.sidebarLogo}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            Financial Report
          </div>
          
          {/* Tab navigation */}
          <div className={styles.tabsList}>
            {tabs.map(tab => (
              <div 
                key={tab.id}
                className={`${styles.tabItem} ${activeTab === tab.id ? styles.tabItemActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span className={styles.tabTitle}>{tab.title}</span>
              </div>
            ))}
            
            {/* Export to PDF option */}
            <div 
              className={styles.tabItem}
              onClick={exportToPdf}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.tabIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className={styles.tabTitle}>Export PDF</span>
            </div>
          </div>
        </div>
        
        {/* Main content */}
        <div className={styles.mainContent}>
          {/* Back button */}
          <button 
            className={styles.backButton}
            onClick={() => router.push(`/workspace/${params.id}`)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.backIcon}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Workspace
          </button>
          
          {/* Report header */}
          <div className={styles.reportHeader}>
            <h1 className={styles.reportTitle}>{reportName}</h1>
            <div className={styles.reportMeta}>
              <div className={styles.reportDate}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={styles.dateIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25c0 .621-.504 1.125-1.125 1.125H5.625c-.621 0-1.125-.504-1.125-1.125v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                {reportDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
          </div>
          
          {/* Loading state */}
          {isLoading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingSpinner}></div>
              <p>Generating financial report...</p>
            </div>
          ) : error ? (
            <div className={styles.errorContainer}>
              <div className={styles.errorIcon}>⚠️</div>
              <h3>Unable to Generate Report</h3>
              <p>{error}</p>
              <button 
                className={styles.backButton}
                onClick={() => router.push(`/workspace/${params.id}`)}
              >
                Return to Workspace
              </button>
            </div>
          ) : reportData ? (
            <>
              {/* Executive Summary */}
              {activeTab === 'overview' && (
                <div className={styles.overviewSection}>
                  <div className={styles.summaryCard}>
                    <h3>Executive Summary</h3>
                    <div className={styles.summaryContent}>
                      {reportData.summary}
                    </div>
                  </div>
                  
                  {/* Key Insights */}
                  {reportData.insights && reportData.insights.length > 0 && (
                    <div className={styles.insightsCard}>
                      <h3>Key Insights</h3>
                      <ul className={styles.insightsList}>
                        {reportData.insights.map((insight, index) => (
                          <li key={index}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Recommendations */}
                  {reportData.recommendations && reportData.recommendations.length > 0 && (
                    <div className={styles.recommendationsCard}>
                      <h3>Recommendations</h3>
                      <ul className={styles.recommendationsList}>
                        {reportData.recommendations.map((recommendation, index) => (
                          <li key={index}>{recommendation}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Summary of All Tables */}
                  <div className={styles.tablesOverview}>
                    <h3>Financial Summary Tables</h3>
                    <div className={styles.tableCards}>
                      {reportData.tables.map((table) => (
                        <div 
                          key={table.id} 
                          className={styles.tableCard}
                          onClick={() => setActiveTab(table.id)}
                        >
                          <h4>{table.title}</h4>
                          <p>{table.description}</p>
                          <span className={styles.tableStats}>
                            {table.data.length} rows • {table.columns.length} columns
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Summary tables for specific tabs with detailed analysis */}
              {activeTab !== 'overview' && (
                <div className={styles.summaryTables}>
                  {getVisibleTables().map(table => {
                    const detailedAnalysis = reportData.detailedAnalysis?.[table.id];
                    
                    return (
                      <div key={table.id} className={styles.tableSection} id={table.id}>
                        <h3 className={styles.tableHeader}>{table.title}</h3>
                        <p className={styles.tableDescription}>{table.description}</p>
                        
                        {/* Financial Table */}
                        <div className={styles.tableWrapper}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                {table.columns.map(column => (
                                  <th key={column.accessor} className={column.isNumeric ? styles.number : ''}>
                                    {column.header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {table.data.map((row, index) => (
                                <tr key={index} className={getRowClass(row)}>
                                  {table.columns.map(column => {
                                    const value = row[column.accessor];
                                    return (
                                      <td 
                                        key={column.accessor}
                                        className={getCellClass(value, column.isNumeric)}
                                      >
                                        {column.isNumeric && column.isCurrency && typeof value === 'number'
                                          ? formatCurrency(value)
                                          : column.isNumeric
                                          ? formatNumber(value)
                                          : value || ''}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Detailed Analysis Section */}
                        {detailedAnalysis && (
                          <div className={styles.detailedAnalysis}>
                            <h4 className={styles.analysisTitle}>
                              📊 Comprehensive Financial Analysis
                            </h4>
                            
                            <div className={styles.analysisGrid}>
                              {/* Business Context */}
                              <div className={styles.analysisSection}>
                                <h5 className={styles.analysisSubtitle}>
                                  Business Context
                                </h5>
                                <p className={styles.analysisText}>{detailedAnalysis.businessContext}</p>
                              </div>
                              
                              {/* Financial Implications */}
                              <div className={styles.analysisSection}>
                                <h5 className={styles.analysisSubtitle}>
                                  Financial Implications
                                </h5>
                                <p className={styles.analysisText}>{detailedAnalysis.financialImplications}</p>
                              </div>
                              
                              {/* Industry Benchmark */}
                              <div className={styles.analysisSection}>
                                <h5 className={styles.analysisSubtitle}>
                                  Industry Benchmark
                                </h5>
                                <p className={styles.analysisText}>{detailedAnalysis.industryBenchmark}</p>
                              </div>
                              
                              {/* Risk Factors */}
                              {detailedAnalysis.riskFactors && detailedAnalysis.riskFactors.length > 0 && (
                                <div className={styles.analysisSection}>
                                  <h5 className={`${styles.analysisSubtitle} ${styles.riskTitle}`}>
                                    Risk Factors
                                  </h5>
                                  <ul className={styles.analysisList}>
                                    {detailedAnalysis.riskFactors.map((risk, index) => (
                                      <li key={index} className={`${styles.analysisListItem} ${styles.riskItem}`}>
                                        {risk}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className={styles.errorContainer}>
              <div className={styles.errorIcon}>📊</div>
              <h3>No Report Data Available</h3>
              <p>Unable to generate financial report from available data.</p>
              <button 
                className={styles.backButton}
                onClick={() => router.push(`/workspace/${params.id}`)}
              >
                Return to Workspace
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportPage;
