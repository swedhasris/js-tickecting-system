import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Building2, Save, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../contexts/AuthContext";
import { useBranding } from "../contexts/BrandingContext";
import { ROLE_HIERARCHY } from "../lib/roles";

export function BrandingSettings() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { branding, updateCompanyName, updateLogo, loading } = useBranding();

  const [companyName, setCompanyName] = useState(branding.companyName);
  const [previewLogo, setPreviewLogo] = useState<string | null>(branding.logoBase64);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  React.useEffect(() => {
    if (!loading && !hasInitialized) {
      setCompanyName(branding.companyName);
      setPreviewLogo(branding.logoBase64);
      setHasInitialized(true);
    }
  }, [loading, branding, hasInitialized]);

  // Check if user has access (super_admin or ultra_super_admin)
  const hasAccess = profile?.role === "super_admin" || profile?.role === "ultra_super_admin";

  if (!hasAccess) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg border border-border p-8 text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            Only Super Admin and Ultra Super Admin can access branding settings.
          </p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setMessage("Please select an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage("File size must be less than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setPreviewLogo(result);
      setMessage("");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage("");

    try {
      // Update company name
      if (companyName.trim() && companyName !== branding.companyName) {
        await updateCompanyName(companyName.trim());
      }

      // Update logo
      if (previewLogo !== branding.logoBase64) {
        await updateLogo(previewLogo, previewLogo ? "image/png" : null);
      }

      setMessage("Settings saved successfully!");
    } catch (error) {
      setMessage("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveLogo = () => {
    setPreviewLogo(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Branding Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Customize your company logo and name
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving || loading}
          className="bg-sn-green text-sn-dark hover:bg-sn-green/90"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.includes("success") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Name */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Company Name
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Display Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full p-3 border border-border rounded-lg outline-none focus:ring-2 focus:ring-sn-green"
                placeholder="Enter company name"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will appear in the sidebar and throughout the application.
              </p>
            </div>
          </div>
        </div>

        {/* Logo Upload */}
        <div className="bg-white rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Image className="w-5 h-5" />
            Company Logo
          </h2>
          <div className="space-y-4">
            {/* Preview */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border border-border">
                {previewLogo ? (
                  <img
                    src={previewLogo}
                    alt="Logo Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 bg-sn-green rounded flex items-center justify-center font-bold text-sn-dark text-xl">
                    {companyName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Logo Preview</p>
                <p className="text-xs text-muted-foreground">
                  Recommended: 64x64px, PNG format
                </p>
              </div>
            </div>

            {/* Upload Button */}
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Logo
              </Button>
              {previewLogo && (
                <Button
                  variant="outline"
                  onClick={handleRemoveLogo}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Supported formats: PNG, JPG, JPEG. Max size: 2MB.
            </p>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="bg-white rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Live Preview</h2>
        <div className="bg-sn-sidebar text-white p-4 rounded-lg inline-flex items-center gap-3">
          {previewLogo ? (
            <img
              src={previewLogo}
              alt="Logo"
              className="w-8 h-8 rounded object-cover"
            />
          ) : (
            <div className="w-8 h-8 bg-sn-green rounded flex items-center justify-center font-bold text-sn-dark">
              {companyName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-xl font-bold tracking-tight">{companyName}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          This is how your branding will appear in the sidebar.
        </p>
      </div>
    </div>
  );
}
