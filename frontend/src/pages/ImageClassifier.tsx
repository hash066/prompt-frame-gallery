import { useEffect, useRef, useState } from "react";

// Lazy import to keep initial bundle smaller; Vite will code-split this chunk
let mobilenetModelLoader: any;
let tfLoader: any;

const ImageClassifier = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [prediction, setPrediction] = useState<{ className: string; probability: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        // Dynamic import to avoid bloating initial bundle
        if (!tfLoader) {
          tfLoader = () => import("@tensorflow/tfjs");
        }
        if (!mobilenetModelLoader) {
          mobilenetModelLoader = () => import("@tensorflow-models/mobilenet");
        }
        await tfLoader();
        const mobilenet = await mobilenetModelLoader();
        if (cancelled) return;
        const model = await mobilenet.load({ version: 2, alpha: 1.0 });
        if (cancelled) return;
        modelRef.current = model;
        setModelReady(true);
      } catch (e: any) {
        setError(e?.message || "Failed to load model");
      } finally {
        setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrediction(null);
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const classify = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setPrediction(null);
      if (!modelRef.current) {
        setError("Model not ready yet. Please wait a moment.");
        return;
      }
      const img = imageRef.current;
      if (!img) {
        setError("No image selected.");
        return;
      }
      const results = await modelRef.current.classify(img);
      if (results && results.length > 0) {
        const top = results[0];
        setPrediction({ className: top.className, probability: top.probability });
      } else {
        setError("No prediction returned.");
      }
    } catch (e: any) {
      setError(e?.message || "Classification failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/70 dark:bg-gray-900/50 backdrop-blur rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h1 className="text-2xl font-bold">Image Classification</h1>
            <p className="text-sm text-gray-500 mt-1">Runs entirely in your browser using TensorFlow.js MobileNet.</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Upload an image</label>
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {!modelReady && (
                <p className="text-xs text-gray-500 mt-2">Loading model… this takes a few seconds on first load.</p>
              )}
            </div>

            {previewUrl && (
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                    <img
                      ref={imageRef}
                      src={previewUrl}
                      alt="Preview"
                      className="w-full h-auto object-contain max-h-[420px]"
                    />
                  </div>
                </div>
                <div className="w-full md:w-72">
                  <button
                    onClick={classify}
                    disabled={!modelReady || isLoading}
                    className="w-full inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Classifying…" : "Classify Image"}
                  </button>

                  <div className="mt-4 space-y-2">
                    {prediction && (
                      <div className="p-4 rounded-lg border border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
                        <div className="text-sm font-semibold">Top Prediction</div>
                        <div className="mt-1 text-sm">
                          {prediction.className}
                        </div>
                        <div className="mt-2 h-2 w-full bg-green-200/50 rounded">
                          <div
                            className="h-2 bg-green-600 rounded"
                            style={{ width: `${Math.round(prediction.probability * 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs">
                          {Math.round(prediction.probability * 1000) / 10}% confidence
                        </div>
                      </div>
                    )}
                    {error && (
                      <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!previewUrl && (
              <div className="text-sm text-gray-500">
                Choose an image file to see a preview and run classification.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageClassifier;
