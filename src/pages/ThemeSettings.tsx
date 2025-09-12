import { useState, useEffect } from "react";
import { Palette, Plus, Trash2, Edit3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ThemeEditor, type Theme, type ThemePalette } from "@/components/ThemeEditor";
import { useToast } from "@/hooks/use-toast";

// Mock API functions - replace with actual API calls
const mockThemes: Theme[] = [
  {
    id: 'default-dark',
    name: 'Default Dark',
    description: 'Modern dark theme with blue accents',
    isDefault: true,
    palette: {
      primary: { main: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
      secondary: { main: '#6b7280', light: '#9ca3af', dark: '#374151' },
      background: { main: '#0f172a', light: '#1e293b', dark: '#020617' },
      surface: { main: '#1e293b', light: '#334155', dark: '#0f172a' },
      text: { primary: '#f8fafc', secondary: '#cbd5e1', disabled: '#64748b' },
      accent: { main: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed' },
      success: { main: '#10b981', light: '#34d399', dark: '#059669' },
      warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
      error: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
      border: { main: '#334155', light: '#475569', dark: '#1e293b' },
      card: { main: '#1e293b', light: '#334155', dark: '#0f172a' },
      button: {
        primary: { bg: '#3b82f6', text: '#ffffff', hover: '#2563eb' },
        secondary: { bg: '#6b7280', text: '#ffffff', hover: '#5b6674' },
        ghost: { bg: 'transparent', text: '#cbd5e1', hover: '#334155' }
      }
    }
  },
  {
    id: 'default-light',
    name: 'Default Light',
    description: 'Clean light theme with blue accents',
    isDefault: false,
    palette: {
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
    }
  }
];

export default function ThemeSettings() {
  const [themes, setThemes] = useState<Theme[]>(mockThemes);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const { toast } = useToast();

  const handleSaveTheme = (theme: Theme) => {
    const existingIndex = themes.findIndex(t => t.id === theme.id);
    
    if (existingIndex >= 0) {
      // Update existing theme
      const newThemes = [...themes];
      newThemes[existingIndex] = theme;
      setThemes(newThemes);
      toast({
        title: "Theme updated",
        description: `"${theme.name}" has been updated successfully.`,
      });
    } else {
      // Add new theme
      setThemes(prev => [...prev, { ...theme, id: `theme-${Date.now()}` }]);
      toast({
        title: "Theme created",
        description: `"${theme.name}" has been created successfully.`,
      });
    }
    
    setEditorOpen(false);
    setSelectedTheme(null);
  };

  const handleDeleteTheme = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId);
    if (theme?.isDefault) {
      toast({
        title: "Cannot delete",
        description: "Default themes cannot be deleted.",
        variant: "destructive",
      });
      return;
    }
    
    setThemes(prev => prev.filter(t => t.id !== themeId));
    toast({
      title: "Theme deleted",
      description: "Theme has been deleted successfully.",
    });
  };

  const handleExportTheme = (theme: Theme) => {
    const dataStr = JSON.stringify(theme, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `${theme.name.toLowerCase().replace(/\s+/g, '-')}-theme.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    toast({
      title: "Theme exported",
      description: `"${theme.name}" has been exported successfully.`,
    });
  };

  const openEditor = (theme?: Theme) => {
    setSelectedTheme(theme || null);
    setEditorOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
            <Palette className="w-8 h-8" />
            Theme Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Create, edit, and manage your custom themes and color palettes
          </p>
        </div>
        
        <Button 
          onClick={() => openEditor()}
          className="bg-gradient-primary hover:bg-gradient-secondary transition-smooth glow-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Theme
        </Button>
      </div>

      {/* Themes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {themes.map((theme) => (
          <Card key={theme.id} className="group relative overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {theme.name}
                    {theme.isDefault && (
                      <Badge variant="secondary" className="text-xs">Default</Badge>
                    )}
                  </CardTitle>
                  {theme.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {theme.description}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Color Palette Preview */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Color Palette</h4>
                <div className="grid grid-cols-6 gap-2">
                  <div 
                    className="aspect-square rounded border border-border/50"
                    style={{ backgroundColor: theme.palette.primary.main }}
                    title="Primary"
                  />
                  <div 
                    className="aspect-square rounded border border-border/50"
                    style={{ backgroundColor: theme.palette.secondary.main }}
                    title="Secondary"
                  />
                  <div 
                    className="aspect-square rounded border border-border/50"
                    style={{ backgroundColor: theme.palette.accent.main }}
                    title="Accent"
                  />
                  <div 
                    className="aspect-square rounded border border-border/50"
                    style={{ backgroundColor: theme.palette.success.main }}
                    title="Success"
                  />
                  <div 
                    className="aspect-square rounded border border-border/50"
                    style={{ backgroundColor: theme.palette.warning.main }}
                    title="Warning"
                  />
                  <div 
                    className="aspect-square rounded border border-border/50"
                    style={{ backgroundColor: theme.palette.error.main }}
                    title="Error"
                  />
                </div>
              </div>
              
              {/* Theme Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditor(theme)}
                  className="flex-1"
                >
                  <Edit3 className="w-3 h-3 mr-2" />
                  Edit
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportTheme(theme)}
                >
                  <Download className="w-3 h-3 mr-2" />
                  Export
                </Button>
                
                {!theme.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTheme(theme.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Theme Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-6xl h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {selectedTheme ? `Edit "${selectedTheme.name}"` : 'Create New Theme'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            <ThemeEditor
              theme={selectedTheme || undefined}
              onSave={handleSaveTheme}
              className="p-0"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
