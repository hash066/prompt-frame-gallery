import { useState } from "react";
import { Search, Filter, Calendar, Camera, Tag, User, Globe } from "lucide-react";
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
    if (key === 'search') return typeof value === 'string' && value.length > 0;
    if (key === 'tags') return Array.isArray(value) && value.length > 0;
    if (key === 'dateRange') return value && typeof value === 'object' && 'from' in value && (value.from || value.to);
    return value !== undefined && value !== '';
  }).length - 2; // Exclude sortBy and sortOrder from count

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Bar */}
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

                {/* Album Filter */}
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

                {/* Date Range Filter */}
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

                {/* Camera Filters */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    Camera & Lens
                  </Label>
                  
                  {availableCameras.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Camera</Label>
                      <Select 
                        value={filters.camera || ""}
                        onValueChange={(value) => updateFilters({ camera: value || undefined })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select camera" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Any camera</SelectItem>
                          {availableCameras.map((camera) => (
                            <SelectItem key={camera} value={camera}>
                              {camera}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {availableLenses.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Lens</Label>
                      <Select 
                        value={filters.lens || ""}
                        onValueChange={(value) => updateFilters({ lens: value || undefined })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select lens" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Any lens</SelectItem>
                          {availableLenses.map((lens) => (
                            <SelectItem key={lens} value={lens}>
                              {lens}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* License Filter */}
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
                      <SelectItem value="cc-by-sa">CC BY-SA</SelectItem>
                      <SelectItem value="cc-by-nc">CC BY-NC</SelectItem>
                      <SelectItem value="all-rights-reserved">All Rights Reserved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status and Visibility */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="published"
                      checked={filters.published === true}
                      onCheckedChange={(checked) => 
                        updateFilters({ published: checked ? true : undefined })
                      }
                    />
                    <Label htmlFor="published" className="text-sm">Published only</Label>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Status</Label>
                    <Select 
                      value={filters.status || ""}
                      onValueChange={(value) => updateFilters({ status: value as any || undefined })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any status</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tags Filter */}
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

                {/* Sort Options */}
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

      {/* Active Filter Tags */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          
          {filters.album && (
            <Badge variant="secondary" className="gap-1">
              Album: {availableAlbums.find(a => a.id === filters.album)?.name}
              <button 
                onClick={() => updateFilters({ album: undefined })}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
              >
                ×
              </button>
            </Badge>
          )}

          {filters.dateRange && (filters.dateRange.from || filters.dateRange.to) && (
            <Badge variant="secondary" className="gap-1">
              Date: {filters.dateRange.from?.toLocaleDateString()} - {filters.dateRange.to?.toLocaleDateString()}
              <button 
                onClick={() => updateFilters({ dateRange: undefined })}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
              >
                ×
              </button>
            </Badge>
          )}

          {filters.camera && (
            <Badge variant="secondary" className="gap-1">
              Camera: {filters.camera}
              <button 
                onClick={() => updateFilters({ camera: undefined })}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
              >
                ×
              </button>
            </Badge>
          )}

          {filters.license && (
            <Badge variant="secondary" className="gap-1">
              License: {filters.license}
              <button 
                onClick={() => updateFilters({ license: undefined })}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
              >
                ×
              </button>
            </Badge>
          )}

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
