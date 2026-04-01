import React, { useState } from "react";
import { DebuggerSession, Profile, SimulationMode } from "../types.js";
import { apiClient } from "../api/client.js";

interface InputFormProps {
  onSubmit: (session: DebuggerSession) => void;
  isLoading: boolean;
}

const createDefaultRequest = () => {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 10 * 60; // 10 minutes
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `${Math.floor(Math.random() * 1e8)}-${now}`;

  return {
    "response_type": "vp_token",
    "client_id": "x509_hash:fQuobVwJv000vDWcMtriXPzo2sPTm5_Mp10O87lCqcE",
    "response_uri": "https://playground.eudi-wallet.org/eudiplo/3aa4706c-6f35-47b8-8a05-6a0a334c301d/oid4vp",
    "response_mode": "direct_post.jwt",
    "nonce": randomId,
    "dcql_query": {
    "credentials": [
      {
        "id": "pid-sd-jwt",
        "format": "dc+sd-jwt",
        "claims": [
          {
            "path": [
              "given_name"
            ]
          },
          {
            "path": [
              "family_name"
            ]
          },
          {
            "path": [
              "birthdate"
            ]
          },
          {
            "path": [
              "address",
              "street_address"
            ]
          },
          {
            "path": [
              "address",
              "postal_code"
            ]
          },
          {
            "path": [
              "address",
              "locality"
            ]
          },
          {
            "path": [
              "address",
              "country"
            ]
          },
          {
            "path": [
              "nationalities"
            ]
          }
        ],
        "meta": {
          "vct_values": [
            "urn:eudi:pid:de:1"
          ]
        }
      },
      {
        "id": "pid-mso-mdoc",
        "format": "mso_mdoc",
        "claims": [
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "given_name"
            ]
          },
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "family_name"
            ]
          },
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "birth_date"
            ]
          },
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "resident_street"
            ]
          },
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "resident_postal_code"
            ]
          },
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "resident_city"
            ]
          },
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "resident_country"
            ]
          },
          {
            "path": [
              "eu.europa.ec.eudi.pid.1",
              "nationality"
            ]
          }
        ],
        "meta": {
          "doctype_value": "eu.europa.ec.eudi.pid.1"
        }
      }
    ],
    "credential_sets": [
      {
        "options": [
          [
            "pid-sd-jwt"
          ],
          [
            "pid-mso-mdoc"
          ]
        ]
      }
    ]
  },
  "client_metadata": {
    "jwks": {
      "keys": [
        {
          "kty": "EC",
          "x": "ShU4Fr3NH7v9TOAc9aYiu9eicdkfVT9ecVCPaPgJrMs",
          "y": "iV0VXASylR0qWoDr_mKUWwzo-M59Wz3QBzpCm4oiXT0",
          "crv": "P-256",
          "alg": "ECDH-ES",
          "kid": "a420ee83-ecfa-44fc-bb16-80320d87f745"
        }
      ]
    },
    "vp_formats_supported": {
      "mso_mdoc": {
        "alg": [
          "ES256",
          "Ed25519"
        ]
      },
      "dc+sd-jwt": {
        "kb-jwt_alg_values": [
          "ES256",
          "Ed25519"
        ],
        "sd-jwt_alg_values": [
          "ES256",
          "Ed25519"
        ]
      }
    },
    "encrypted_response_enc_values_supported": [
      "A128GCM"
    ]
  },
  "state": randomId,
  "aud": "https://self-issued.me/v2",
  "exp": now + expiresIn,
  "iat": now,
  "nbf": now
  };
};

export const InputForm: React.FC<InputFormProps> = ({ onSubmit, isLoading }) => {
  const [inputMode, setInputMode] = useState<'json' | 'url'>('url');
  const [requestJson, setRequestJson] = useState(JSON.stringify(createDefaultRequest(), null, 2));
  const [requestUrl, setRequestUrl] = useState('');
  const [profile, setProfile] = useState<Profile>(Profile.PID_PRESENTATION);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>(SimulationMode.COMPLIANT);
  const [preferredFormat, setPreferredFormat] = useState<'dc+sd-jwt' | 'mso_mdoc'>('dc+sd-jwt');
  const [validateOnly, setValidateOnly] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [urlParseInfo, setUrlParseInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUrlParseInfo(null);

    try {
      let request;

      if (inputMode === 'url') {
        // Parse URL first
        const parseResponse = await apiClient.post("/api/parse-url", { url: requestUrl });

        if (!parseResponse.data.success) {
          const errors = parseResponse.data.data?.errors || ["Failed to parse URL"];
          setError(errors.join(", "));
          return;
        }

        const parseResult = parseResponse.data.data;
        request = parseResult.request;

        // Show URL parse info
        const urlType = parseResult.urlType || 'unknown';
        const checksCount = parseResult.checks?.length || 0;
        const passedChecks = parseResult.checks?.filter((c: any) => c.passed).length || 0;
        setUrlParseInfo(`✓ URL parsed (${urlType} format) - ${passedChecks}/${checksCount} checks passed`);

        // Update JSON view with parsed request
        setRequestJson(JSON.stringify(request, null, 2));
      } else {
        request = JSON.parse(requestJson);
      }

      const response = await apiClient.post("/api/debug", {
        request,
        validationProfile: profile,
        simulationMode,
        postResponseToUri: inputMode === 'url' && !validateOnly,
        preferredFormat,
      });

      if (response.data.success) {
        onSubmit(response.data.data);
      } else {
        setError(response.data.error?.message || "Unknown error");
      }
    } catch (err: any) {
      if (err?.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else if (err?.message) {
        setError(err.message);
      } else if (err instanceof SyntaxError) {
        setError(`Invalid JSON: ${err.message}`);
      } else {
        setError(String(err));
      }
    }
  };

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Input Mode Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            How would you like to test?
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
                inputMode === 'url'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="text-lg mb-1">🔗</div>
              <div className="text-sm">Authorization URL</div>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('json')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
                inputMode === 'json'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="text-lg mb-1">📝</div>
              <div className="text-sm">JSON Request</div>
            </button>
          </div>
        </div>

        {/* URL Input */}
        {inputMode === 'url' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="request-url" className="block text-sm font-medium text-gray-700 mb-2">
                Paste your authorization URL
              </label>
              <input
                id="request-url"
                type="text"
                value={requestUrl}
                onChange={(e) => setRequestUrl(e.target.value)}
                className="w-full font-mono text-sm p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                placeholder="openid4vp://... or https://..."
              />
              <div className="suggestion-box mt-2">
                <div className="suggestion-box__icon">ℹ</div>
                <div className="suggestion-box__content">
                  <p className="text-xs text-gray-600">
                    Get this from your QR code scanner, deep link handler, or web redirect.
                    ERICA will extract and validate the request parameters automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Validate Only Checkbox */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <input
                  id="validate-only"
                  type="checkbox"
                  checked={validateOnly}
                  onChange={(e) => setValidateOnly(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <label htmlFor="validate-only" className="text-sm font-medium text-gray-900 cursor-pointer block">
                    Only validate request (don't POST response back)
                  </label>
                  <p className="text-xs text-gray-600 mt-1">
                    When unchecked, ERICA will simulate a complete wallet flow and POST the VP token to your response_uri (recommended for full integration testing).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* JSON Editor */}
        {inputMode === 'json' && (
          <div>
            <label htmlFor="request-json" className="block text-sm font-medium mb-2">
              Authorization Request (JSON)
            </label>
            <textarea
              id="request-json"
              value={requestJson}
              onChange={(e) => setRequestJson(e.target.value)}
              className="w-full h-64 font-mono text-sm p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Paste or edit your authorization request here..."
            />
          </div>
        )}

        {/* Advanced Options - Collapsible */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 text-sm">Advanced Options</span>
              <span className="text-xs text-gray-500">(Profile, Simulation Mode, Format)</span>
            </div>
            <span className={`text-gray-500 transition transform ${showAdvanced ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showAdvanced && (
            <div className="p-4 border-t border-gray-200 bg-white space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile" className="block text-sm font-medium text-gray-700 mb-2">
                    Validation Profile
                  </label>
                  <select
                    id="profile"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value as Profile)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value={Profile.PID_PRESENTATION}>PID Presentation (EUDI)</option>
                    <option value={Profile.BASE_OPENID4VP}>OpenID4VP Base</option>
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    Default: PID Presentation for German EUDI ecosystem
                  </p>
                </div>

                <div>
                  <label htmlFor="simulation-mode" className="block text-sm font-medium text-gray-700 mb-2">
                    Wallet Behavior
                  </label>
                  <select
                    id="simulation-mode"
                    value={simulationMode}
                    onChange={(e) => setSimulationMode(e.target.value as SimulationMode)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value={SimulationMode.COMPLIANT}>Compliant Wallet</option>
                    <option value={SimulationMode.INVALID_SIGNATURE}>Invalid Signature</option>
                    <option value={SimulationMode.EXPIRED_VC}>Expired Credential</option>
                    <option value={SimulationMode.MISSING_FIELDS}>Missing Fields</option>
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    Test how your RP handles different wallet behaviors
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="preferred-format" className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Credential Format
                </label>
                <select
                  id="preferred-format"
                  value={preferredFormat}
                  onChange={(e) => setPreferredFormat(e.target.value as 'dc+sd-jwt' | 'mso_mdoc')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="dc+sd-jwt">📄 SD-JWT (dc+sd-jwt) - Recommended</option>
                  <option value="mso_mdoc">📱 Mobile Document (mso_mdoc)</option>
                </select>
                <p className="text-xs text-gray-600 mt-1">
                  When your request supports multiple formats, the wallet will prefer this one.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* URL Parse Info */}
        {urlParseInfo && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 text-sm font-medium">{urlParseInfo}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm font-medium">Error</p>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {isLoading ? "Debugging..." : "Debug Request"}
        </button>
      </form>
    </div>
  );
};
