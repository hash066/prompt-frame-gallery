import { useEffect, useMemo, useState } from "react";
import { Search, Save, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listImages, getThumbnailUrl, moveToAlbum } from "@/lib/api";

export default function Albums() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentAlbum, setCurrentAlbum] = useState<string | null>(null);
  const [albums, setAlbums] = useState<string[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Load albums list by scanning a sample of images
  useEffect(() => {
    listImages({ limit: "100" })
      .then((all) => {
        const names = Array.from(
          new Set(
            all
              .map((img: any) => (img.metadata && img.metadata.album ? String(img.metadata.album) : null))
              .filter(Boolean)
          )
        ) as string[];
        setAlbums(names);
        if (!currentAlbum && names.length > 0) setCurrentAlbum(names[0]);
      })
      .catch(() => setAlbums([]));
  }, []);

  // Load images for current album
  useEffect(() => {
    if (!currentAlbum) {
      setItems([]);
      return;
    }
    listImages({ album: currentAlbum, limit: "100" })
      .then((list) => {
        const mapped = list.map((i: any) => ({
          id: i.id,
          url: getThumbnailUrl(i.id),
          title: i.filename,
          likes: 0,
          prompt: "",
          createdAt: i.uploadedAt
        }));
        setItems(mapped);
      })
      .catch(() => setItems([]));
  }, [currentAlbum]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return items.filter((it) => it.title.toLowerCase().includes(q));
  }, [items, searchQuery]);

  async function onSaveToAlbum(id: string) {
    const name = window.prompt("Move to album", currentAlbum || "My Album");
    if (!name) return;
    try {
      setSavingId(id);
      await moveToAlbum(id, name);
      // If moved out of current album, remove from list
      if (currentAlbum && name !== currentAlbum) {
        setItems((prev) => prev.filter((p) => p.id !== id));
      }
      if (!albums.includes(name)) setAlbums((prev) => [...prev, name]);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Albums</h1>
          <p className="text-muted-foreground">Organize your images into albums</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search within album..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-input/50 border-border/50"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {albums.map((name) => (
          <Button
            key={name}
            variant={currentAlbum === name ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentAlbum(name)}
            className="rounded-full capitalize"
          >
            {name}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map((image) => (
          <Card key={image.id} className="group overflow-hidden bg-gallery-card border-border/50">
            <div className="relative aspect-square overflow-hidden">
              <img src={image.url} alt="" className="w-full h-full object-cover" />
            </div>
            <CardContent className="p-4">
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  title="Like"
                  aria-label="Like"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <Heart className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="default"
                  className="h-8 w-8"
                  title={savingId === image.id ? "Saving…" : "Save"}
                  aria-label="Save"
                  onClick={(e) => { e.stopPropagation(); onSaveToAlbum(image.id); }}
                  disabled={savingId === image.id}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No images in this album yet.</div>
      )}
    </div>
  );
}
