#!/bin/bash

version=0.2
build_dir="src_b"

cp -r "src" "$build_dir"
sed -i -r 's/@@EXTVERSION@@/'"$version"'/' "$build_dir/manifest.json" "$build_dir/background.js"
mkdir -p "xpi"
rm -rf "xpi/editIRT-$version.xpi"
cd "$build_dir"
  zip -r "../xpi/editIRT-$version.xpi" ./*
cd -
rm -rf "$build_dir"
