{
  "targets": [
    {
      "target_name": "adblock_core",
      "sources": [ "adblock.cc" ],
      "include_dirs": [ "<!@(node -p \"require('node-addon-api').include\")" ],
      "cflags_cc": [ "-std=c++17", "-O3", "-fexceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_CPP_EXCEPTIONS", "NAPI_VERSION=9" ],
      "libraries!": [ "-lnode" ]
    }
  ]
}
