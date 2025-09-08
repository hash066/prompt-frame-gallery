import { useState } from "react";
import { Sparkles, Download, Heart, Share, Settings, Wand2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function Generate() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  
  // Generation parameters
  const [params, setParams] = useState({
    model: "flux-dev",
    size: "1024x1024",
    steps: 28,
    seed: "",
    batchCount: 1,
    guidanceScale: 7.5,
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setGeneratedImages([]);

    try {
      // Simulate generation progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return 95;
          }
          return prev + Math.random() * 10;
        });
      }, 500);

      // TODO: Implement actual image generation with AI service
      // For now, simulate with sample images
      setTimeout(() => {
        clearInterval(progressInterval);
        setProgress(100);
        
        // Sample generated images
        const sampleImages = [
          "https://images.unsplash.com/photo-1686191128892-4462634c36cf?w=512&h=512&fit=crop",
          "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=512&h=512&fit=crop",
        ];
        
        setGeneratedImages(sampleImages.slice(0, params.batchCount));
        toast.success(`Generated ${params.batchCount} image(s) successfully!`);
        setIsGenerating(false);
        setProgress(0);
      }, 3000);

    } catch (error) {
      toast.error("Generation failed. Please try again.");
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const presetPrompts = [
    "A majestic dragon soaring through storm clouds",
    "Cyberpunk cityscape with neon lights at night",
    "Magical forest with glowing mushrooms and fairy lights",
    "Astronaut floating in space with distant galaxies",
    "Steampunk mechanical creature in a workshop",
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generation Controls */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-gallery-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 gradient-text">
                <Wand2 className="w-5 h-5" />
                Generate Image
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Prompt */}
              <div className="space-y-2">
                <Label htmlFor="prompt" className="text-sm font-medium">
                  Prompt
                </Label>
                <Textarea
                  id="prompt"
                  placeholder="Describe the image you want to generate..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[100px] bg-input/50 border-border/50 focus:border-primary transition-smooth resize-none"
                />
                <div className="flex flex-wrap gap-1">
                  {presetPrompts.slice(0, 3).map((preset, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="text-xs border-border/50 hover:border-primary/50 transition-colors"
                      onClick={() => setPrompt(preset)}
                    >
                      {preset.split(' ').slice(0, 3).join(' ')}...
                    </Button>
                  ))}
                </div>
              </div>

              {/* Negative Prompt */}
              <div className="space-y-2">
                <Label htmlFor="negative-prompt" className="text-sm font-medium">
                  Negative Prompt <span className="text-muted-foreground">(Optional)</span>
                </Label>
                <Textarea
                  id="negative-prompt"
                  placeholder="What you don't want in the image..."
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  className="min-h-[60px] bg-input/50 border-border/50 focus:border-primary transition-smooth resize-none"
                />
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Model</Label>
                <Select value={params.model} onValueChange={(value) => setParams(prev => ({ ...prev, model: value }))}>
                  <SelectTrigger className="bg-input/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flux-dev">Flux Dev (Best Quality)</SelectItem>
                    <SelectItem value="flux-schnell">Flux Schnell (Fast)</SelectItem>
                    <SelectItem value="sd-xl">Stable Diffusion XL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Size Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Size</Label>
                <Select value={params.size} onValueChange={(value) => setParams(prev => ({ ...prev, size: value }))}>
                  <SelectTrigger className="bg-input/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="512x512">512×512 (Square)</SelectItem>
                    <SelectItem value="1024x1024">1024×1024 (Square HD)</SelectItem>
                    <SelectItem value="1024x768">1024×768 (Landscape)</SelectItem>
                    <SelectItem value="768x1024">768×1024 (Portrait)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced Settings */}
              <div className="space-y-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Advanced Settings</Label>
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Steps</Label>
                    <Badge variant="outline" className="text-xs">{params.steps}</Badge>
                  </div>
                  <Slider
                    value={[params.steps]}
                    onValueChange={(value) => setParams(prev => ({ ...prev, steps: value[0] }))}
                    max={50}
                    min={10}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Guidance Scale */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Guidance Scale</Label>
                    <Badge variant="outline" className="text-xs">{params.guidanceScale}</Badge>
                  </div>
                  <Slider
                    value={[params.guidanceScale]}
                    onValueChange={(value) => setParams(prev => ({ ...prev, guidanceScale: value[0] }))}
                    max={20}
                    min={1}
                    step={0.5}
                    className="w-full"
                  />
                </div>

                {/* Seed */}
                <div className="space-y-2">
                  <Label htmlFor="seed" className="text-sm">Seed (Optional)</Label>
                  <Input
                    id="seed"
                    placeholder="Random seed for reproducible results"
                    value={params.seed}
                    onChange={(e) => setParams(prev => ({ ...prev, seed: e.target.value }))}
                    className="bg-input/50 border-border/50 focus:border-primary transition-smooth"
                  />
                </div>

                {/* Batch Count */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Batch Count</Label>
                    <Badge variant="outline" className="text-xs">{params.batchCount}</Badge>
                  </div>
                  <Slider
                    value={[params.batchCount]}
                    onValueChange={(value) => setParams(prev => ({ ...prev, batchCount: value[0] }))}
                    max={4}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full bg-gradient-primary hover:bg-gradient-secondary transition-smooth glow-primary"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Image
                  </>
                )}
              </Button>

              {/* Progress */}
              {isGenerating && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="text-primary font-medium">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Generated Images */}
        <div className="lg:col-span-2">
          <Card className="bg-gallery-card border-border/50 min-h-[600px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Generated Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              {generatedImages.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {generatedImages.map((imageUrl, index) => (
                    <div key={index} className="group relative">
                      <div className="relative aspect-square overflow-hidden rounded-lg border border-border/50">
                        <img
                          src={imageUrl}
                          alt={`Generated image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" className="bg-white/20 backdrop-blur-sm">
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="secondary" className="bg-white/20 backdrop-blur-sm">
                              <Heart className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="secondary" className="bg-white/20 backdrop-blur-sm">
                              <Share className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 p-2 bg-gallery-hover rounded text-xs space-y-1">
                        <div className="font-medium text-card-foreground">Image {index + 1}</div>
                        <div className="text-muted-foreground line-clamp-2">{prompt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[400px] text-center">
                  <div className="w-16 h-16 mb-4 bg-gradient-primary/20 rounded-full flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 gradient-text">Ready to Create</h3>
                  <p className="text-muted-foreground mb-4 max-w-md">
                    Enter a prompt and click generate to start creating amazing AI images
                  </p>
                  {!isGenerating && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                      {presetPrompts.slice(0, 4).map((preset, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          className="text-xs border-border/50 hover:border-primary/50 transition-colors text-left justify-start"
                          onClick={() => setPrompt(preset)}
                        >
                          {preset.split(' ').slice(0, 4).join(' ')}...
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}