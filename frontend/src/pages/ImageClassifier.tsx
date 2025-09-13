import { useRef, useState } from "react";
import { classifyImage, type Classification } from "@/lib/api";

const ImageClassifier = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [labels, setLabels] = useState<Classification[] | null>(null);
  const [results, setResults] = useState<null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabels(null);
    setResults(null);
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setFile(f);
  };

  const run = async () => {
    try {
      if (!file) {
        setError("No image selected.");
        return;
      }
      setIsLoading(true);
      setError(null);
      const lbls = await classifyImage(file, 5);
      setLabels(lbls);
    } catch (e: any) {
      setError(e?.message || "Operation failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white/70 dark:bg-gray-900/50 backdrop-blur rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h1 className="text-2xl font-bold">Image Classification</h1>
            <p className="text-sm text-gray-500 mt-1">Upload an image to get predicted labels.</p>
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
                    onClick={run}
                    disabled={isLoading || !file}
                    className="w-full inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Classifying…" : "Classify"}
                  </button>

                  <div className="mt-4 space-y-2">
                    {labels && (
                      <div className="p-4 rounded-lg border border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
                        <div className="text-sm font-semibold">Top Labels</div>
                        <ul className="mt-2 space-y-1 text-sm">
                          {labels.map((p, i) => (
                            <li key={i} className="flex items-center justify-between gap-2">
                              <span>{p.label}</span>
                              <span className="text-xs">{Math.round(p.score * 1000) / 10}%</span>
                            </li>
                          ))}
                        </ul>
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
                Choose an image file to see a preview and get labels.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageClassifier;


