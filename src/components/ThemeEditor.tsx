import { useState, useEffect } from "react";
import { 
  Palette, 
  Save, 
  Download, 
  Upload, 
  Eye, 
  EyeOff, 
  RotateCcw,
  AlertTriangle,
  Check 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

// Theme palette structure
export interface ThemePalette {
  primary: { main: string; light: string; dark: string };
  secondary: { main: string; light: string; dark: string };
  background: { main: string; light: string; dark: string };
  surface: { main: string; light: string; dark: string };
  text: { primary: string; secondary: string; disabled: string };
  accent: { main: string; light: string; dark: string };
  success: { main: string; light: string; dark: string };
  warning: { main: string; light: string; dark: string };
  error: { main: string; light: string; dark: string };
  border: { main: string; light: string; dark: string };
  card: { main: string; light: string; dark: string };
  button: {
    primary: { bg: string; text: string; hover: string };
    secondary: { bg: string; text: string; hover: string };
    ghost: { bg: string; text: string; hover: string };
  };
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  palette: ThemePalette;
  isDefault?: boolean;
  userId?: string;
}

interface ThemeEditorProps {
  theme?: Theme;
  onSave: (theme: Theme) => void;
  onExport?: (theme: Theme) => void;
  onImport?: (file: File) => void;
  className?: string;
}

// Default theme for initialization
const DEFAULT_THEME: ThemePalette = {
  primary: { main: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
  secondary: { main: '#6b7280', light: '#9ca3af', dark: '#374151' },
  background: { main: '#ffffff', light: '#f8fafc', dark: '#f1f5f9' },
  surface: { main: '#ffffff', light: '#f8fafc', dark: '#f1f5f9' },
  text: { primary: '#0f172a', secondary: '#475569', disabled: '#94a3b8' },
  accent: { main: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed' },
  success: { main: '#10b981', light: '#34d399', dark: '#059669' },
  warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
  error: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
  border: { main: '#e2e8f0', light: '#f1f5f9', dark: '#cbd5e1' },
  card: { main: '#ffffff', light: '#f8fafc', dark: '#f1f5f9' },
  button: {
    primary: { bg: '#3b82f6', text: '#ffffff', hover: '#2563eb' },
    secondary: { bg: '#6b7280', text: '#ffffff', hover: '#5b6674' },
    ghost: { bg: 'transparent', text: '#475569', hover: '#f1f5f9' }
  }
};

// Color contrast calculation for accessibility
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return 1;
  
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  
  return (brightest + 0.05) / (darkest + 0.05);
}

function ColorInput({ 
  label, 
  value, 
  onChange, 
  contrastWith 
}: { 
  label: string; 
  value: string; 
  onChange: (value: string) => void;
  contrastWith?: string;
}) {
  const contrastRatio = contrastWith ? getContrastRatio(value, contrastWith) : null;
  const isAccessible = contrastRatio ? contrastRatio >= 4.5 : true;

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <div 
          className="w-8 h-8 rounded border border-border/50 flex-shrink-0"
          style={{ backgroundColor: value }}
        />
        <Input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 h-8 p-0 border-0 bg-transparent cursor-pointer"
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
          placeholder="#000000"
        />
        {contrastWith && contrastRatio && (
          <div className="flex items-center gap-1">
            {isAccessible ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            )}
            <span className={`text-xs ${
              isAccessible ? 'text-green-600' : 'text-red-600'
            }`}>
              {contrastRatio.toFixed(1)}
            </span>
          </div>
        )}
      </div>
      {contrastWith && contrastRatio && !isAccessible && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Contrast ratio {contrastRatio.toFixed(1)} fails WCAG AA (4.5+)
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function ThemeEditor({ 
  theme, 
  onSave, 
  onExport, 
  onImport,
  className 
}: ThemeEditorProps) {
  const [currentTheme, setCurrentTheme] = useState<Theme>({
    id: theme?.id || 'custom-theme',
    name: theme?.name || 'Custom Theme',
    description: theme?.description || '',
    palette: theme?.palette || DEFAULT_THEME
  });
  
  const [previewMode, setPreviewMode] = useState(false);
  const [activeTab, setActiveTab] = useState('colors');

  // Apply theme to CSS variables for live preview
  useEffect(() => {
    if (previewMode) {
      const root = document.documentElement;
      const { palette } = currentTheme;
      
      // Apply CSS custom properties
      root.style.setProperty('--primary', palette.primary.main);
      root.style.setProperty('--background', palette.background.main);
      root.style.setProperty('--foreground', palette.text.primary);
      root.style.setProperty('--card', palette.card.main);
      root.style.setProperty('--border', palette.border.main);
    }
    
    // Cleanup function to restore original theme
    return () => {
      if (previewMode) {
        const root = document.documentElement;
        root.style.removeProperty('--primary');
        root.style.removeProperty('--background');
        root.style.removeProperty('--foreground');
        root.style.removeProperty('--card');
        root.style.removeProperty('--border');
      }
    };
  }, [currentTheme, previewMode]);

  const updatePalette = (path: string, value: string) => {
    setCurrentTheme(prev => {
      const newTheme = { ...prev };
      const keys = path.split('.');
      let current: any = newTheme.palette;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      
      return newTheme;
    });
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(currentTheme, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `${currentTheme.name.toLowerCase().replace(/\s+/g, '-')}-theme.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const resetToDefault = () => {
    setCurrentTheme(prev => ({
      ...prev,
      palette: { ...DEFAULT_THEME }
    }));
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <Palette className="w-6 h-6" />
            Theme Editor
          </h2>
          <p className="text-muted-foreground mt-1">
            Customize every aspect of your gallery's appearance
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
          >
            {previewMode ? (
              <><EyeOff className="w-4 h-4 mr-2" />Exit Preview</>
            ) : (
              <><Eye className="w-4 h-4 mr-2" />Preview</>
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {previewMode && (
        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription>
            Preview mode is active. All changes are applied to the UI in real-time.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Theme Settings */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Theme Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Theme Name</Label>
                <Input
                  value={currentTheme.name}
                  onChange={(e) => setCurrentTheme(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Custom Theme"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={currentTheme.description}
                  onChange={(e) => setCurrentTheme(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your theme..."
                  rows={3}
                />
              </div>
              
              <Button 
                onClick={() => onSave(currentTheme)}
                className="w-full"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Theme
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Color Editor */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Color Palette</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="colors">Colors</TabsTrigger>
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="buttons">Buttons</TabsTrigger>
                  <TabsTrigger value="states">States</TabsTrigger>
                </TabsList>
                
                <ScrollArea className="h-96 mt-4">
                  <TabsContent value="colors" className="space-y-6">
                    {/* Primary Colors */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-sm">Primary Colors</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <ColorInput
                          label="Main"
                          value={currentTheme.palette.primary.main}
                          onChange={(value) => updatePalette('primary.main', value)}
                        />
                        <ColorInput
                          label="Light"
                          value={currentTheme.palette.primary.light}
                          onChange={(value) => updatePalette('primary.light', value)}
                        />
                        <ColorInput
                          label="Dark"
                          value={currentTheme.palette.primary.dark}
                          onChange={(value) => updatePalette('primary.dark', value)}
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="text" className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="font-medium text-sm">Text Colors</h4>
                      <div className="space-y-4">
                        <ColorInput
                          label="Primary Text"
                          value={currentTheme.palette.text.primary}
                          onChange={(value) => updatePalette('text.primary', value)}
                          contrastWith={currentTheme.palette.background.main}
                        />
                        <ColorInput
                          label="Secondary Text"
                          value={currentTheme.palette.text.secondary}
                          onChange={(value) => updatePalette('text.secondary', value)}
                          contrastWith={currentTheme.palette.background.main}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Preview Section */}
      {previewMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Live Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Button>Primary Button</Button>
                <Button variant="secondary">Secondary Button</Button>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Sample Card</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    This is how your cards will look with the new theme.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Badge>Tag</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
