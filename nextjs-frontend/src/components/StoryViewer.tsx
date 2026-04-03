import { useState, useEffect } from 'react';
import { Story } from '../hooks/useStories';

interface StoryViewerProps {
  stories: Story[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onView: (storyId: number) => void;
}

export default function StoryViewer({ 
  stories, 
  currentIndex, 
  onClose, 
  onNext, 
  onPrevious,
  onView
}: StoryViewerProps) {
  const [progress, setProgress] = useState(0);
  const story = stories[currentIndex];
  const STORY_DURATION = 5000; // 5 seconds

  useEffect(() => {
    if (!story) return;

    // Mark as viewed
    if (!story.is_viewed_by_me) {
      onView(story.id);
    }

    // Progress animation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          onNext();
          return 0;
        }
        return prev + (100 / (STORY_DURATION / 100));
      });
    }, 100);

    return () => {
      clearInterval(interval);
      setProgress(0);
    };
  }, [story, currentIndex]);

  if (!story) return null;

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setProgress(0);
      onPrevious();
    }
  };

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setProgress(0);
      onNext();
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white hover:text-gray-300"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Story Container */}
      <div className="relative max-w-lg w-full h-full md:h-[90vh] bg-gray-900">
        {/* Progress Bars */}
        <div className="absolute top-0 left-0 right-0 z-10 flex space-x-1 p-2">
          {stories.map((_, index) => (
            <div key={index} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-100"
                style={{
                  width: index < currentIndex ? '100%' : index === currentIndex ? `${progress}%` : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Author Info */}
        <div className="absolute top-4 left-0 right-0 z-10 px-4 mt-4">
          <div className="flex items-center space-x-3">
            {story.author.profile_picture ? (
              <img
                src={`http://localhost:8001${story.author.profile_picture}`}
                alt={story.author.username}
                className="w-10 h-10 rounded-full border-2 border-white"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold border-2 border-white">
                {story.author.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white font-semibold">{story.author.username}</p>
              <p className="text-white/70 text-sm">{story.time_ago} ago</p>
            </div>
          </div>
        </div>

        {/* Story Content */}
        <div className="w-full h-full flex items-center justify-center">
          {story.image && (
            <img
              src={story.image}
              alt="Story"
              className="w-full h-full object-cover"
            />
          )}

          {story.video && (
            <video
              src={story.video}
              className="w-full h-full object-cover"
              autoPlay
              muted
              onEnded={handleNext}
            />
          )}

          {story.text_content && !story.image && !story.video && (
            <div
              className="w-full h-full flex items-center justify-center p-8"
              style={{ backgroundColor: story.background_color }}
            >
              <p className="text-white text-3xl font-bold text-center">{story.text_content}</p>
            </div>
          )}
        </div>

        {/* Navigation Areas */}
        <div className="absolute inset-0 flex">
          {/* Left Half - Previous */}
          <div 
            className="w-1/3 h-full cursor-pointer"
            onClick={handlePrevious}
          />
          {/* Right Half - Next */}
          <div 
            className="w-2/3 h-full cursor-pointer"
            onClick={handleNext}
          />
        </div>

        {/* View Count */}
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="flex items-center text-white/80 text-sm">
            <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            {story.views_count} {story.views_count === 1 ? 'view' : 'views'}
          </div>
        </div>
      </div>
    </div>
  );
}
