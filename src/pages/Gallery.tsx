import { useState } from "react";
import { Search, Filter, Grid, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sampleImages = [
  {
    id: 1,
    url: "https://images.unsplash.com/photo-1686191128892-4462634c36cf?w=400&h=400&fit=crop",
    title: "Cyberpunk City",
    prompt: "A futuristic cyberpunk cityscape at night with neon lights",
    tags: ["cyberpunk", "city", "neon", "futuristic"],
    likes: 24,
    createdAt: "2024-01-15",
  },
  {
    id: 2,
    url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=400&h=400&fit=crop",
    title: "Mystical Forest",
    prompt: "A magical forest with glowing mushrooms and fairy lights",
    tags: ["fantasy", "forest", "magical", "mushrooms"],
    likes: 18,
    createdAt: "2024-01-14",
  },
  {
    id: 3,
    url: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400&h=400&fit=crop",
    title: "Space Explorer",
    prompt: "An astronaut floating in space with distant galaxies",
    tags: ["space", "astronaut", "galaxy", "cosmic"],
    likes: 32,
    createdAt: "2024-01-13",
  },
  {
    id: 4,
    url: "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=400&fit=crop",
    title: "Dragon's Lair",
    prompt: "A majestic dragon in its treasure-filled cave",
    tags: ["dragon", "fantasy", "treasure", "cave"],
    likes: 45,
    createdAt: "2024-01-12",
  },
  {
    id: 5,
    url: "https://images.unsplash.com/photo-1579353977828-2a4eab540b9b?w=400&h=400&fit=crop",
    title: "Ocean Depths",
    prompt: "Deep sea creatures in a bioluminescent underwater world",
    tags: ["ocean", "underwater", "bioluminescent", "creatures"],
    likes: 28,
    createdAt: "2024-01-11",
  },
  {
    id: 6,
    url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop",
    title: "Mountain Peak",
    prompt: "A snow-capped mountain peak during golden hour",
    tags: ["mountain", "snow", "golden hour", "nature"],
    likes: 19,
    createdAt: "2024-01-10",
  },
];

export default function Gallery() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = Array.from(
    new Set(sampleImages.flatMap(img => img.tags))
  ).slice(0, 8);

  const filteredImages = sampleImages.filter(img => {
    const matchesSearch = img.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         img.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         img.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesTag = !selectedTag || img.tags.includes(selectedTag);
    
    return matchesSearch && matchesTag;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">AI Gallery</h1>
          <p className="text-muted-foreground">Discover amazing AI-generated artwork</p>
        </div>
        
        <Button className="bg-gradient-primary hover:bg-gradient-secondary transition-smooth glow-primary">
          <Plus className="w-4 h-4 mr-2" />
          Generate New
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search images, prompts, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-input/50 border-border/50 focus:border-primary transition-smooth"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-border/50 hover:border-primary transition-smooth"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          
          <div className="flex rounded-lg border border-border/50 overflow-hidden">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="rounded-none"
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="rounded-none"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedTag === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedTag(null)}
          className="rounded-full"
        >
          All
        </Button>
        {allTags.map(tag => (
          <Button
            key={tag}
            variant={selectedTag === tag ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            className="rounded-full capitalize"
          >
            {tag}
          </Button>
        ))}
      </div>

      {/* Images Grid */}
      <div className={
        viewMode === "grid" 
          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          : "space-y-4"
      }>
        {filteredImages.map((image) => (
          <Card 
            key={image.id} 
            className="group overflow-hidden bg-gallery-card hover:bg-gallery-hover transition-smooth border-border/50 hover:border-primary/30 glow-primary hover:glow-primary cursor-pointer"
          >
            <div className="relative aspect-square overflow-hidden">
              <img
                src={image.url}
                alt={image.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute bottom-4 left-4 right-4 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 opacity-0 group-hover:opacity-100">
                <p className="text-white text-sm font-medium mb-1">{image.title}</p>
                <p className="text-white/80 text-xs line-clamp-2">{image.prompt}</p>
              </div>
            </div>
            
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                  {image.title}
                </h3>
                <Badge variant="secondary" className="text-xs">
                  ❤️ {image.likes}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground line-clamp-2">
                {image.prompt}
              </p>
              
              <div className="flex flex-wrap gap-1">
                {image.tags.slice(0, 3).map(tag => (
                  <Badge 
                    key={tag} 
                    variant="outline" 
                    className="text-xs capitalize border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTag(tag);
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
                {image.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs border-border/50">
                    +{image.tags.length - 3}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredImages.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No images found</h3>
          <p className="text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
}