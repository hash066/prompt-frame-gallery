import { useState } from "react";
import { Search, Filter, Calendar, Camera, Tag, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DateRange } from "react-day-picker";

export interface SearchFilters {
  search: string;
  album?: string;
  dateRange?: DateRange;
  camera?: string;
  lens?: string;
  license?: string;
  tags?: string[];
  published?: boolean;
  status?: 'completed' | 'processing' | 'failed';
  sortBy?: 'uploaded_at' | 'title' | 'size';
  sortOrder?: 'ASC' | 'DESC';
}

interface SearchAndFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  availableAlbums?: Array<{ id: string; name: string }>;
  availableTags?: string[];
  availableCameras?: string[];
  availableLenses?: string[];
  className?: string;
}

export function SearchAndFilters({
  filters,
  onFiltersChange,
  availableAlbums = [],
  availableTags = [],
  availableCameras = [],
  availableLenses = [],
  className
}: SearchAndFiltersProps) {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const updateFilters = (updates: Partial<SearchFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      sortBy: 'uploaded_at',
      sortOrder: 'DESC'
    });
  };

  const activeFiltersCount = Object.keys(filters).filter(key => {
    const value = filters[key as keyof SearchFilters];
    if (key === 'search') return value && value.length > 0;
    if (key === 'tags') return Array.isArray(value) && value.length > 0;
    if (key === 'dateRange') return value && (value.from || value.to);
    return value !== undefined && value !== '';
  }).length - 2;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search images, titles, captions, tags, metadata..."
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="pl-10 bg-input/50 border-border/50 focus:border-primary transition-smooth"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-border/50 hover:border-primary transition-smooth"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 w-5 rounded-full p-0 text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium leading-none">Filters</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-auto p-0 text-xs"
                  >
                    Clear all
                  </Button>
                </div>

                {availableAlbums.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Album
                    </Label>
                    <Select 
                      value={filters.album || ""}
                      onValueChange={(value) => updateFilters({ album: value || undefined })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select album" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All albums</SelectItem>
                        {availableAlbums.map((album) => (
                          <SelectItem key={album.id} value={album.id}>
                            {album.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Date Range
                  </Label>
                  <DatePickerWithRange
                    date={filters.dateRange}
                    onDateChange={(dateRange) => updateFilters({ dateRange })}
                  />
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    Camera & Lens
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">License</Label>
                  <Select 
                    value={filters.license || ""}
                    onValueChange={(value) => updateFilters({ license: value || undefined })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select license" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any license</SelectItem>
                      <SelectItem value="cc0">CC0 (Public Domain)</SelectItem>
                      <SelectItem value="cc-by">CC BY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {availableTags.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Tags
                    </Label>
                    <div className="max-h-32 overflow-y-auto space-y-2">
                      {availableTags.map((tag) => (
                        <div key={tag} className="flex items-center space-x-2">
                          <Checkbox
                            id={`tag-${tag}`}
                            checked={filters.tags?.includes(tag) || false}
                            onCheckedChange={(checked) => {
                              const currentTags = filters.tags || [];
                              if (checked) {
                                updateFilters({ tags: [...currentTags, tag] });
                              } else {
                                updateFilters({ 
                                  tags: currentTags.filter(t => t !== tag) 
                                });
                              }
                            }}
                          />
                          <Label htmlFor={`tag-${tag}`} className="text-sm capitalize">
                            {tag}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-4">
                  <Label className="text-sm font-medium">Sort</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Sort by</Label>
                      <Select 
                        value={filters.sortBy || "uploaded_at"}
                        onValueChange={(value) => updateFilters({ sortBy: value as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uploaded_at">Date Uploaded</SelectItem>
                          <SelectItem value="title">Title</SelectItem>
                          <SelectItem value="size">File Size</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Order</Label>
                      <Select 
                        value={filters.sortOrder || "DESC"}
                        onValueChange={(value) => updateFilters({ sortOrder: value as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DESC">Newest first</SelectItem>
                          <SelectItem value="ASC">Oldest first</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {filters.tags && filters.tags.length > 0 && filters.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button 
                onClick={() => updateFilters({ 
                  tags: filters.tags?.filter(t => t !== tag) 
                })}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

