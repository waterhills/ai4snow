import torch
data = torch.load('output/runs/ay1/ay1_rtmpose_keypoints.pt', map_location='cpu')
print("Type:", type(data))
if isinstance(data, dict):
    print("Keys:", data.keys())
    if 'keypoints' in data:
        kps = data['keypoints']
        print("Type of keypoints:", type(kps))
        print("Length:", len(kps))
        if len(kps) > 0:
            print("Item 0 Type:", type(kps[0]))
            print("Item 0:", kps[0])
else:
    print(data)
