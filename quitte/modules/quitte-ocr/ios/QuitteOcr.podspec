Pod::Spec.new do |s|
  s.name           = 'QuitteOcr'
  s.version        = '1.0.0'
  s.summary        = 'Bonnetjes lezen op het toestel (Apple Vision)'
  s.description    = 'Tekstherkenning voor Quitte met het Vision-framework, volledig op het toestel.'
  s.author         = 'Zichtwerf Studio'
  s.homepage       = 'https://quitte-app.vercel.app'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Vision'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = "**/*.{h,m,mm,swift}"
end
