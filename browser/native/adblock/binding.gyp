{
  "targets": [
    {
      "target_name": "adblock_core",
      "sources": [ "adblock.cc" ],
      "include_dirs": [ "<!@(node -p \"require('node-addon-api').include\")" ],
      "cflags_cc": [ "-std=c++17", "-O3", "-fexceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_CPP_EXCEPTIONS", "NAPI_VERSION=9" ],
      "libraries!": [ "-lnode" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "GCC_OPTIMIZATION_LEVEL": "3",
        "MACOSX_DEPLOYMENT_TARGET": "12.0"
      }
    }
  ]
}
